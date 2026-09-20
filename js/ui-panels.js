/**
 * ui-panels.js
 * Left/right side-panel content: the architecture tree data + renderer, and the layer-visibility / legend list builders.
 */

// =====================================================================
// ARCHITECTURE TREE DATA  (section 18)
// =====================================================================
var TREE = [
  { label:'CMOS INVERTER', children:[
    { label:'SUBSTRATE', children:[ { label:'P-SUBSTRATE', id:'psub' } ] },
    { label:'WELL', children:[ { label:'N-WELL', id:'nwell' } ] },
    { label:'TRANSISTORS', children:[
      { label:'PMOS', id:'pmos', children:[
        { label:'SOURCE', id:'pmosSrc' }, { label:'GATE', id:'poly' }, { label:'DRAIN', id:'pmosDrn' }
      ]},
      { label:'NMOS', id:'nmos', children:[
        { label:'SOURCE', id:'nmosSrc' }, { label:'GATE', id:'poly' }, { label:'DRAIN', id:'nmosDrn' }
      ]}
    ]},
    { label:'POLYSILICON', children:[ { label:'COMMON GATE', id:'poly' } ] },
    { label:'GATE OXIDE', children:[ { label:'PMOS OXIDE', id:'pmosOxide' }, { label:'NMOS OXIDE', id:'nmosOxide' } ] },
    { label:'CONTACTS', id:'pmosSrcCt', children:[
      { label:'PMOS SRC CT', id:'pmosSrcCt' }, { label:'PMOS DRN CT', id:'pmosDrnCt' },
      { label:'NMOS SRC CT', id:'nmosSrcCt' }, { label:'NMOS DRN CT', id:'nmosDrnCt' },
      { label:'POLY / IN CT', id:'polyCt' }
    ]},
    { label:'METAL-1', children:[
      { label:'VDD', id:'vddRail' }, { label:'GND', id:'gndRail' },
      { label:'IN', id:'inPin' }, { label:'OUT', id:'outPin' }
    ]}
  ]}
];

// virtual (non-mesh) ids resolve to an aggregate info + representative mesh(es) to highlight
var VIRTUAL = {
  pmos: { info:'pmos', meshes:['pmosSrc','pmosDrn','poly'] },
  nmos: { info:'nmos', meshes:['nmosSrc','nmosDrn','poly'] }
};

function idToInfo(id){
  if (INFO[id]) return INFO[id];
  var map = { pmosSrc:'actP', pmosDrn:'actP', nmosSrc:'actN', nmosDrn:'actN',
    pmosOxide:'oxide', nmosOxide:'oxide',
    pmosSrcCt:'contact', pmosDrnCt:'contact', nmosSrcCt:'contact', nmosDrnCt:'contact', polyCt:'contact',
    welltapCt:'welltap', subtapCt:'subtap', welltapAct:'welltap', subtapAct:'subtap',
    vddRail:'vdd', vddStubPmos:'vdd', vddStubTap:'vdd', gndRail:'gnd', gndStubNmos:'gnd', gndStubTap:'gnd',
    inPin:'inNet', outPin:'outNet', outSpine:'outNet', poly:'poly', nwell:'nwell', psub:'psub' };
  return INFO[map[id]] || null;
}

function meshesForId(id){
  if (VIRTUAL[id]) return VIRTUAL[id].meshes.map(findMesh).filter(Boolean);
  var m = findMesh(id);
  return m ? [m] : [];
}
function findMesh(id){
  for (var i=0;i<selectable.length;i++){ if (selectable[i].userData.id === id) return selectable[i]; }
  return null;
}

// build tree DOM
var treeRoot = document.getElementById('tree');
function renderTree(nodes, depth){
  var ul = document.createElement('ul');
  nodes.forEach(function(n){
    var li = document.createElement('li');
    var row = document.createElement('div');
    row.className = 'node';
    row.dataset.id = n.id || '';
    var bullet = n.children ? '▸' : '·';
    row.innerHTML = '<span class="bullet">'+bullet+'</span><span>'+n.label+'</span>';
    if (n.id){
      row.addEventListener('click', function(e){ e.stopPropagation(); selectById(n.id); });
    }
    li.appendChild(row);
    if (n.children) li.appendChild(renderTree(n.children, depth+1));
    ul.appendChild(li);
  });
  return ul;
}
treeRoot.appendChild(renderTree(TREE, 0));

// =====================================================================
// LAYER PANEL + LEGEND PANEL
// =====================================================================
var layerMeta = [
  { key:'substrate', name:'SUBSTRATE', color:'var(--c-substrate)' },
  { key:'well', name:'N-WELL', color:'var(--c-well)' },
  { key:'active', name:'ACTIVE / DIFFUSION', color:'var(--c-active-p)' },
  { key:'oxide', name:'GATE OXIDE', color:'var(--c-oxide)' },
  { key:'poly', name:'POLYSILICON', color:'var(--c-poly)' },
  { key:'contact', name:'CONTACT', color:'var(--c-contact)' },
  { key:'metal', name:'METAL-1 (incl. VDD/GND/IN/OUT)', color:'var(--c-metal)' }
];
var layersBody = document.getElementById('layers-body');
layerMeta.forEach(function(l){
  var row = document.createElement('div');
  row.className = 'layer-row';
  row.innerHTML = '<input type="checkbox" checked data-layer="'+l.key+'"><span class="swatch" style="background:'+l.color+'"></span><label>'+l.name+'</label>';
  layersBody.appendChild(row);
  row.querySelector('input').addEventListener('change', function(e){
    groups[l.key].visible = e.target.checked;
  });
  row.querySelector('label').addEventListener('click', function(){
    var cb = row.querySelector('input'); cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  });
});

var legendBody = document.getElementById('legend-body');
LEGEND.forEach(function(l){
  var div = document.createElement('div');
  div.className = 'legend-item';
  div.innerHTML = '<div class="lh"><span class="swatch" style="background:'+l.color+'"></span><b>'+l.name+'</b></div><p>'+l.desc+'</p>';
  legendBody.appendChild(div);
});

// collapsible panel sections
document.querySelectorAll('.panel-head').forEach(function(h){
  h.addEventListener('click', function(){
    var body = document.getElementById(h.dataset.target);
    var chev = h.querySelector('.chev');
    body.classList.toggle('hidden');
    chev.classList.toggle('closed');
  });
});

