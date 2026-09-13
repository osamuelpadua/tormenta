import fs from 'node:fs';
const pages = JSON.parse(fs.readFileSync('.cache/pdf/book.json', 'utf8'));
const clean = s => s.replace(/(\p{L})\s*-\s*\n\s*(\p{Ll})/gu, '$1$2').replace(/[ \t]+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const classes = [ ['Arcanista',42,45], ['Bárbaro',46,48], ['Bardo',49,51], ['Bucaneiro',52,54], ['Caçador',55,57], ['Cavaleiro',58,61], ['Clérigo',62,65], ['Druida',66,69], ['Guerreiro',70,72], ['Inventor',73,77], ['Ladino',78,80], ['Lutador',81,83], ['Nobre',84,86], ['Paladino',87,90] ];
const skip = /^(Capítulo|Construção de|Perícias &|Perícias|Pontos de|Proficiências|Itens|Benefícios|Tabela|Pré-requisito|Capítulo|Modificadores|Armaduras|Características|Habilidades|Poder de |Habilidades de |Nível|Descrição das|Poderes gerais|Escolhendo|Grupos de)/i;
const catalog = [];
let current;
let skillGroup='';
const skillNames=['Acrobacia','Adestramento','Atletismo','Atuação','Cavalgar','Conhecimento','Cura','Diplomacia','Enganação','Fortitude','Furtividade','Guerra','Iniciativa','Intimidação','Intuição','Investigação','Jogatina','Ladinagem','Luta','Misticismo','Nobreza','Ofício','Percepção','Pilotagem','Pontaria','Reflexos','Religião','Sobrevivência','Vontade'];
const flush = () => {
  if (!current) return;
  current.description = clean(current.description).replace(/(\p{L})-\s+(\p{Ll})/gu,'$1$2');
  if (current.description.length > 10) catalog.push(current);
  current = undefined;
};
for (const page of pages) {
  const n = page.page;
  const cls = classes.find(([,a,b]) => n>=a && n<=b);
  const section = n>=184&&n<=217 ? 'spell' : cls ? 'classPower' : n>=130&&n<=143 ? 'power' : n>=91&&n<=101 ? 'origin' : n>=102&&n<=111 ? 'deity' : n>=25&&n<=37 ? 'raceAbility' : n>=400&&n<=401 ? 'condition' : n>=152&&n<=173 ? 'equipment' : n>=341&&n<=355 ? 'magicItem' : n>=266&&n<=268 ? 'partner' : n>=121&&n<=129 ? 'skillUse' : undefined;
  if (!section) { flush(); continue; }
  if(section==='raceAbility')flush();
  const items = page.items.filter(i => i.y>43 && !/_f11$/.test(i.font));
  for (let i=0;i<items.length;i++) {
    let item = items[i], name = '', kind = section, group = cls?.[0] ?? '';
    let count = 0;
    const heading = item.height>=15 && item.height<17;
    const big = item.height>=20 && item.height<=28;
    const bullet = /^•(?:\s|$)/.test(item.text) && /_f(?:10|13)$/.test(item.font) && section==='classPower';
    const bold = /_f6$/.test(item.font) && item.height<12 && !skip.test(item.text);
    if(section==='skillUse'&&big&&skillNames.includes(item.text.trim())) { flush();skillGroup=item.text.trim();continue; }
    if(section==='skillUse'&&heading) { flush();continue; }
    if(section==='partner'&&big) { flush();continue; }
    if (bullet) {
      name=item.text.replace(/^•\s*/,'');
      while (!name.trim().endsWith('.') && items[i+1] && count++<12) { name+=' '+items[++i].text; }
    } else if ((section==='spell' && heading) || (section==='power' && heading) || (section==='origin' && (heading||big)) || (section==='deity' && big) || (['equipment','magicItem'].includes(section)&&(heading||bold)) || (section==='partner'&&heading) || (section==='skillUse'&&bold) || (['classPower','raceAbility','condition'].includes(section)&&bold)) {
      name = item.text;
      while (items[i+1] && items[i+1].font===item.font && Math.abs(items[i+1].height-item.height)<0.1 && (heading||big||!name.endsWith('.')) && count++<12) name+=' '+items[++i].text;
      if (cls && !bullet) kind='ability';
      if (section==='origin'&&heading) kind='originPower';
    }
    if(name) {
      name=clean(name).replace(/\.$/, '');
      if (/^(Itens|Benefícios)\.?$/.test(name)) { if(current) current.description+='\n'+name+'. '; continue; }
      if (skip.test(name)||name.length>90||/^\+|^\d|^–|^e$/.test(name)) { if(current) current.description+='\n'; continue; }
      flush();
      if (section==='power') group = n<=134?'Combate':n<=136?'Destino':n===137?'Magia':n<=141?'Concedidos':'Tormenta';
      if (section==='skillUse') group=skillGroup;
      current={ id:`${kind}-${slug(group?group+' '+name:name)}`, name, kind, group, page:n-6, pdfPage:n, endPage:n-6, description:'' };
    } else if (current && !(item.height>=20) && !/_f17$/.test(item.font)) {
      current.description += item.text + (item.end?'\n':' ');
      current.endPage=n-6;
    }
  }
}
flush();
const unique = [];
const ids = new Map();
for (const e of catalog) {
  e.sourceVersion='t20-jda-2023-11-17';
  e.reviewStatus='extracted';
  if(e.kind==='classPower'&&['Bruxo','Feiticeiro','Mago','Básica','Aprimorada','Superior','Bastião','Montaria','Égide Sagrada','Montaria Sagrada'].includes(e.name))e.kind='classChoice';
  const times=ids.get(e.id)??0; ids.set(e.id,times+1);
  if (/Famosos$/.test(e.name) || ['Origens','Sua Própria Origem','Deuses','Recompensas'].includes(e.name)) continue;
  if(times) e.id+=`-${e.page}-${times+1}`;
  if(e.kind==='power') {
    const destiny=['Acrobático','Ao Sabor do Destino','Sortudo','Surto Heroico','Torcida','Treinamento em Perícia','Venefício','Vontade de Ferro'];
    const magic=['Celebrar Ritual','Escrever Pergaminho','Foco em Magia','Magia Acelerada','Magia Ampliada','Magia Discreta','Magia Ilimitada','Preparar Poção'];
    const granted136=['Urro Divino','Visão nas Trevas','Voz da Civilização','Voz da Natureza','Voz dos Monstros','Zumbificar'];
    e.group=magic.includes(e.name)?'Magia':destiny.includes(e.name)||e.page===130?'Destino':e.page<=129?'Combate':e.page<=135||granted136.includes(e.name)?'Concedidos':'Tormenta';
  }
  if(e.kind==='spell') {
    const match=e.description.match(/^(Arcana|Divina|Universal)\s+(\d)\s*\(([^)]+)\)/i);
    if(!match) continue;
    e.magicType=match[1]; e.circle=Number(match[2]); e.school=match[3];
    e.cost=[0,1,3,6,10,15][e.circle];
    for(const [key,label] of Object.entries({execution:'Execução',range:'Alcance',duration:'Duração',resistance:'Resistência',target:'Alvo',area:'Área',effect:'Efeito'})) {
      const match=e.description.replaceAll('\n',' ').match(new RegExp(label+':\\s*([^;.]+)[;.]','i'));
      if(match) e[key]=match[1].trim();
    }
    const enh=[...e.description.matchAll(/(Truque|\+\d+ PM):\s*([\s\S]*?)(?=(?:Truque|\+\d+ PM):|$)/g)];
    e.enhancements=enh.map((m,i)=>({id:`${e.id}-${i}`,cost:m[1]==='Truque'?0:Number(m[1].match(/\d+/)[0]),trick:m[1]==='Truque',text:clean(m[2]),repeatable:/^aumenta/i.test(m[2]),requiresCircle:Number(m[2].match(/Requer (\d)º círculo/)?.[1]??0)}));
  }
  const prereq=e.description.match(/Pré-requisitos?:\s*([\s\S]*?)(?:\.|$)/i);if(prereq)e.prerequisites=clean(prereq[1]);
  unique.push(e);
}
const classDetails=classes.map(([name,start,end])=>{
  const text=pages.slice(start-1,end).map(p=>p.text).join('\n');
  const initial=text.match(/começa com\s*(\d+)\s*pontos de vida/i);
  const gain=text.match(/ganha\s*(\d+)\s*PV/i);
  const mana=text.match(/Pontos de Mana\.\s*(\d+)\s*PM/i);
  const skills=text.match(/Perícias\.\s*([\s\S]*?)Proficiências\./i)?.[1]??'';
  const prof=text.match(/Proficiências\.\s*([\s\S]*?)\./i)?.[1]??'';
  const progression={}; let lvl=0;
  for(const p of pages.slice(start-1,end))for(const i of p.items.filter(i=>/_f17$/.test(i.font)&&i.y>40)){
    const m=i.text.match(/^(\d+)º$/);if(m){lvl=Number(m[1]);progression[lvl]='';} else if(lvl)progression[lvl]+=' '+i.text;
  }
  return {id:slug(name),name,page:start-6,initialHp:Number(initial?.[1]??0),hpPerLevel:Number(gain?.[1]??0),mpPerLevel:Number(mana?.[1]??0),skills:clean(skills),proficiencies:clean(prof),progression:Object.fromEntries(Object.entries(progression).map(([k,v])=>[k,clean(v)]))};
});
fs.writeFileSync('src/data/catalog.json', JSON.stringify(unique,null,2));
fs.writeFileSync('src/data/class-source.json',JSON.stringify(classDetails,null,2));
const totals={};for(const e of unique)totals[e.kind]=(totals[e.kind]??0)+1;
fs.writeFileSync('docs/catalog-audit.json',JSON.stringify({totals,entries:unique.map(e=>({id:e.id,name:e.name,page:e.page,kind:e.kind,characters:e.description.length}))},null,2));
console.log(totals);
console.log(classDetails.map(c=>({name:c.name,hp:c.initialHp,gain:c.hpPerLevel,mp:c.mpPerLevel,levels:Object.keys(c.progression).length})));
