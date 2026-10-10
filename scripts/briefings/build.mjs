// Build with the Codex bundled presentation runtime. No application dependencies are added.
// NODE_PATH alone does not resolve ESM packages. Link the bundled node_modules beside
// a temporary copy of this script, then invoke the bundled Node executable.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {Presentation, PresentationFile} from '@oai/artifact-tool';
const repo = process.env.BRIEFING_REPO;
if (!repo) throw Error('Set BRIEFING_REPO to the checkout containing the briefing content.');
const runtime = process.env.BRIEFING_RUNTIME ?? '/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const skill = process.env.BRIEFING_SKILL ?? '/Users/apple/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations';
process.env.RUNTIME_NODE_MODULES ??= path.join(runtime,'node/node_modules');
const workspaceDir = process.env.BRIEFING_BUILD_DIR ?? '/tmp/briefings-build';
const {finalizePresentation} = await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const pack=JSON.parse(await fs.readFile(path.join(repo,'apps/about/src/lib/briefing-content.json'),'utf8'));
const font='Arial'; // Installed system font and design.css fallback; editable in PowerPoint.
const colors={ink:'#323131',paper:'#f7f3f3',teal:'#0f7d75',muted:'#5a5555',border:'#d8cfc9'};
const out=path.join(workspaceDir,'output');await fs.mkdir(out,{recursive:true});
function text(slide,name,value,x,y,w,h,size,bold=false,color=colors.ink){
 const shape=slide.shapes.add({name,geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 shape.text=value;shape.text.style={typeface:font,fontSize:size,bold,color};return shape;
}
for(const [slug,deck] of Object.entries(pack.briefings)){
 const p=Presentation.create({slideSize:{width:1280,height:720}});const tables=[];
 for(const [i,s] of deck.slides.entries()){
  const slide=p.slides.add();slide.background.fill=colors.paper;
  text(slide,'title',s.title,72,70,1136,145,i===0?58:48,true);
  const y=238;
  if(s.table){
   tables.push(i+1);const rows=s.table.length,cols=s.table[0].length;
   const table=slide.tables.add({rows,columns:cols,left:72,top:y,width:1136,height:Math.min(370,rows*68),columnWidths:[420,716],values:s.table});
   table.borders.assign({style:'solid',fill:colors.border,width:1});
   for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const cell=table.getCell(r,c);cell.fill=r===0?colors.ink:'#ffffff';
    cell.text.style={typeface:font,fontSize:26,bold:r===0,color:r===0?'#ffffff':colors.ink};
   }
  } else if(s.image){
   s.paragraphs.forEach((v,k)=>text(slide,'paragraph-'+k,v,72,y+k*146,495,135,30));
   const bytes=await fs.readFile(path.join(repo,'apps/about/public/briefings/assets',s.image));
   slide.images.add({blob:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),contentType:'image/png',alt:'Actual isolated Observatory access screen. No participant or vendor result.',fit:'contain',position:{left:610,top:220,width:598,height:380}});
   text(slide,'image-provenance','Review interface, 10 October 2026. PRs 109–110.',610,612,598,28,18,false,colors.muted);
  }else{
   const gap=s.paragraphs.length===3?112:142;
   s.paragraphs.forEach((v,k)=>text(slide,'paragraph-'+k,v,72,y+k*gap,1080,gap-18,i===0?36:34));
  }
  text(slide,'disclosure','Independent synthetic prototype',72,668,960,25,18,false,colors.muted);
  text(slide,'page',String(i+1),1150,668,58,25,18,false,colors.muted);
  const cites=s.sources.map(id=>`${pack.sources[id].title}: ${pack.sources[id].url}`).join('\n');
  slide.speakerNotes.text=`${s.notes}\n\nSources\n${cites}\n\nPrepared ${pack.prepared}. Original preparation baseline ${pack.baseline}. Status refreshed ${pack.statusUpdated}: Observatory PRs 109–110 merged. Dated evidence remains at its recorded revision.`;
 }
 const privateDir=path.join(workspaceDir,slug);await fs.mkdir(privateDir,{recursive:true});
 for(const [i,slide] of p.slides.items.entries()){
  const png=await p.export({slide,format:'png',scale:1});await fs.writeFile(path.join(privateDir,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
 }
 const candidate=path.join(privateDir,'candidate.pptx');await(await PresentationFile.exportPptx(p)).save(candidate);
 const final=path.join(out,slug+'.pptx');
 await finalizePresentation({workspaceDir,candidatePath:candidate,finalPath:final,pythonExecutable:path.join(runtime,'python/bin/python3'),integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit',...tables.flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:tables,fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(privateDir,'validation.json')});
 console.log(JSON.stringify({deck:slug,slides:deck.slides.length,final}));
}
