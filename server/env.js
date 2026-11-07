const fs=require('node:fs');
const path=require('node:path');

const file=path.resolve(__dirname,'..','.env');
if(fs.existsSync(file)){
 for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  const line=raw.trim();
  if(!line||line.startsWith('#'))continue;
  const match=line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if(!match||process.env[match[1]]!==undefined)continue;
  let value=match[2].trim();
  if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  else value=value.replace(/\s+#.*$/,'').trim();
  process.env[match[1]]=value;
 }
}

module.exports={file};
