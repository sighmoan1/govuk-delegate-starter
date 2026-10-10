# Delegate briefing pack

Use the concept briefing for people meeting delegation and observability for the first time. The design briefing supports discussion of safeguards, service design and production choices. Both have editable PowerPoint files and complete speaker notes.

- [Concept briefing and notes](high-level.md), [editable deck](../../apps/about/public/briefings/high-level.pptx).
- [Design briefing and notes](detailed.md), [editable deck](../../apps/about/public/briefings/detailed.pptx).
- [Current demo guide and URLs](../DEMO_GUIDE.md), with the [presenter runbook and coverage](DEMO_RUNBOOK.md) for commands and optional scenes.
- [Precedents and evidence](SOURCES_AND_EVIDENCE.md).
- [Validation and rehearsal record](VALIDATION.md).
- Browser briefing entry point: `/briefing` on the About app. Individual briefings and notes are readable without PowerPoint.

Prepared 10 October 2026 against main `6b4f3895f246cfe9e274059c57e4dc1ea7989650`. This original preparation baseline is preserved. Current status refreshed 10 October 2026: PRs #109–110 supplying the Observatory contract/explorer are merged. Screenshots identify their source explicitly. Recheck issue #68 and research status before a later presentation.

The source of both slide content and browser pages is `apps/about/src/lib/briefing-content.json`. `scripts/briefings/build.mjs` exports the editable decks using the bundled Artifact Tool runtime, renders slides and invokes the presentation finalizer. It requires the installed presentation skill and runtime paths described in the script. Generated previews and validation records stay outside Git. The final PPTX files live in About public assets for downloads. No API keys or participant records belong in this pack.

Editorial review uses tropes.fyi as guidance for prose, not as an AI detector. Prefer direct subject headings, concrete mechanisms, necessary caveats and sourced findings. Review formulaic contrasts, filler transitions, promotional claims, repeated summaries and decorative formatting. Preserve a useful detail even when it makes a sentence less tidy.
