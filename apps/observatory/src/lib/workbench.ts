import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { digest, FEATURE_NAMES } from "./classification";
import { prisma } from "./db";
import type { Prisma } from "../generated/prisma";
import { ResearchError } from "./ground-truth";

const signal = z.object({ value: z.union([z.boolean(), z.number().finite().nonnegative().max(86400000)]).nullable(), missingness: z.enum(["observed", "not_observed", "not_configured", "error"]), provenance: z.string().max(128), confidence: z.number().min(0).max(1).nullable() }).strict();
const group = z.string().min(1).max(128);
export const Corpus = z.object({ schema: z.literal("observatory-corpus/1"), mode: z.literal("synthetic_fixture"), protocol_version: z.string().min(1).max(80), source_commit: z.string().regex(/^[a-f0-9]{40}$/), rows: z.array(z.object({ id: group, groups: z.object({ intent: group, session: group, actor_family: group, scenario_family: group }).strict(), execution_class: z.enum(["HUMAN_OPERATED", "HUMAN_AI_ASSISTED", "SCRIPTED_AUTOMATION", "AI_AGENT_BROWSER", "AI_AGENT_API", "UNKNOWN"]), signals: z.object(Object.fromEntries(FEATURE_NAMES.map(f => [f, signal])) as Record<typeof FEATURE_NAMES[number], typeof signal>).strict() }).strict()).min(1).max(1000) }).strict();
export async function computeComparison(input: unknown) {
  const parsed = Corpus.safeParse(input);
  if (!parsed.success) throw new ResearchError("INVALID_SYNTHETIC_CORPUS");
  const directory = await mkdtemp(join(tmpdir(), "observatory-analysis-"));
  try {
    await writeFile(join(directory, "corpus.json"), JSON.stringify(parsed.data), { mode: 0o600 });
    // Fixed executable/script paths and argv. No shell or uploaded executable models.
    await promisify(execFile)(process.env.OBSERVATORY_PYTHON ?? "python3", [join(process.cwd(), "research/workbench.py"), join(directory, "corpus.json"), join(directory, "report.json")], { timeout: 60_000, maxBuffer: 32_000, env: { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, PYTHONDONTWRITEBYTECODE: "1", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1" } });
    const report = JSON.parse(await readFile(join(directory, "report.json"), "utf8"));
    if (!/^[a-f0-9]{64}$/.test(report.corpus_digest)) throw new Error("INVALID_REPORT_DIGEST");
    return { corpus: parsed.data, report, corpusDigest: report.corpus_digest as string, configDigest: digest({ runner: "workbench/1", seed: 73, report: report.configurations }) };
  } catch (e) {
    if (e instanceof ResearchError) throw e;
    throw new ResearchError("COMPARISON_FAILED_CHECK_CORPUS_AND_RESEARCH_RUNTIME", 503);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
export async function runComparison(input: unknown) {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(771473) AS locked`;
    if (!locked[0]?.locked) throw new ResearchError("COMPARISON_ALREADY_RUNNING", 409);
    const result = await computeComparison(input);
    const saved = await tx.experimentAnalysis.create({ data: { corpusDigest: result.corpusDigest, configDigest: result.configDigest, corpus: result.corpus as Prisma.InputJsonValue, report: result.report as Prisma.InputJsonValue } });
    return { id: saved.id, created_at: saved.createdAt, corpus_digest: saved.corpusDigest, config_digest: saved.configDigest, report: saved.report };
  }, { maxWait: 3000, timeout: 90_000 });
}
export async function comparisons() {
  return prisma.experimentAnalysis.findMany({ take: 20, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true, corpusDigest: true, configDigest: true, report: true } });
}
