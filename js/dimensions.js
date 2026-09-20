/**
 * dimensions.js
 * The lambda (λ) design-rule system: process-node presets, the dimension table, and the per-component dimension lookup shown inside the inspector/popover.
 */

// =====================================================================
// DIMENSIONS / LAMBDA (λ) DESIGN RULES
// =====================================================================
var LAMBDA_PRESETS = [
  { label:'λ = 1000 nm  (legacy 2 µm process)', nm:1000 },
  { label:'λ = 350 nm  (0.35 µm process)', nm:350 },
  { label:'λ = 130 nm  (0.13 µm process)', nm:130 },
  { label:'λ = 90 nm', nm:90 },
  { label:'λ = 45 nm', nm:45 },
  { label:'λ = 16 nm  (illustrative, finFET-era)', nm:16 }
];
// Simplified Mead–Conway style λ-based design rules. Everything in the
// physical model is expressed as a multiple of λ; the actual nm/µm figure
// scales with whichever λ the user selects below. Rather than a separate
// dimensions button/overlay, the relevant rule(s) are shown directly in the
// inspector for whatever component is currently selected.
var DIM_RULES = [
  { key:'gateLength',   label:'Gate length (L)',            lambda:2 },
  { key:'gateWidth',    label:'Gate width (W)',              lambda:6 },
  { key:'sdLength',     label:'Source/Drain length',         lambda:3 },
  { key:'contactSize',  label:'Contact size (via, W×D)',     lambda:2 },
  { key:'wellOverlap',  label:'Well overlap of active',      lambda:6 },
  { key:'metalWidth',   label:'Metal-1 width',               lambda:3 },
  // vertical / thickness dimensions
  { key:'substrateDepth', label:'Substrate thickness', note:'Exaggerated for display — real dies run hundreds of µm thick; not modeled to scale here.' },
  { key:'wellDepth',     label:'N-well depth',                lambda:8 },
  { key:'activeDepth',   label:'Source/Drain junction depth', lambda:1.5 },
  { key:'oxideThickness',label:'Gate oxide thickness (tOX)',  note:'~2 nm equivalent, illustrative — exaggerated in the model for visibility.' },
  { key:'polyThickness', label:'Poly gate height',            lambda:3 },
  { key:'metalThickness',label:'Metal-1 thickness',           lambda:3 },
  { key:'contactHeight', label:'Contact / via height',        lambda:4 }
];
var currentLambdaNm = 90;

function formatNm(valueNm){
  if (valueNm >= 1000) return (valueNm/1000).toFixed(valueNm % 1000 === 0 ? 1 : 2) + ' \u00B5m';
  return (Math.round(valueNm*100)/100) + ' nm';
}

var lambdaSelect = document.getElementById('lambda-select');
LAMBDA_PRESETS.forEach(function(p, i){
  var opt = document.createElement('option');
  opt.value = p.nm; opt.textContent = p.label;
  if (p.nm === currentLambdaNm) opt.selected = true;
  lambdaSelect.appendChild(opt);
});

function dimValueNm(rule){ return rule.lambda * currentLambdaNm; }

function renderDimRow(rule){
  if (rule.note){
    return '<div class="dims-table-row" style="display:block;">'+
      '<span class="k">'+rule.label+'</span>'+
      '<div class="v" style="margin-top:3px; font-weight:400; font-size:9.5px; line-height:1.5; opacity:.85;">'+rule.note+'</div></div>';
  }
  return '<div class="dims-table-row"><span class="k">'+rule.label+' <span style="opacity:.55">('+rule.lambda+'\u03BB)</span></span><span class="v">'+formatNm(dimValueNm(rule))+'</span></div>';
}

function renderDimsTable(){
  var el = document.getElementById('dims-table');
  el.innerHTML = DIM_RULES.map(renderDimRow).join('');
}
renderDimsTable();

// Which λ-rules apply to each clickable id — shown inline in the inspector
// popup whenever that component is selected.
var DIM_MAP = {
  poly:['gateLength','gateWidth','polyThickness'], pmosOxide:['oxideThickness'], nmosOxide:['oxideThickness'],
  pmos:['gateLength','gateWidth','sdLength','polyThickness'], nmos:['gateLength','gateWidth','sdLength','polyThickness'],
  pmosSrc:['sdLength','gateWidth','activeDepth'], pmosDrn:['sdLength','gateWidth','activeDepth'],
  nmosSrc:['sdLength','gateWidth','activeDepth'], nmosDrn:['sdLength','gateWidth','activeDepth'],
  pmosSrcCt:['contactSize','contactHeight'], pmosDrnCt:['contactSize','contactHeight'],
  nmosSrcCt:['contactSize','contactHeight'], nmosDrnCt:['contactSize','contactHeight'],
  polyCt:['contactSize','contactHeight'], welltapCt:['contactSize','contactHeight'], subtapCt:['contactSize','contactHeight'],
  vddRail:['metalWidth','metalThickness'], gndRail:['metalWidth','metalThickness'], inPin:['metalWidth','metalThickness'],
  outPin:['metalWidth','metalThickness'], outSpine:['metalWidth','metalThickness'],
  vddStubPmos:['metalWidth','metalThickness'], vddStubTap:['metalWidth','metalThickness'],
  gndStubNmos:['metalWidth','metalThickness'], gndStubTap:['metalWidth','metalThickness'],
  nwell:['wellOverlap','wellDepth'], welltapAct:['wellOverlap'], subtapAct:['wellOverlap'],
  psub:['substrateDepth']
};
function dimsHtmlForId(id){
  var keys = DIM_MAP[id];
  if (!keys || !keys.length) return '';
  var rows = keys.map(function(k){
    var rule = DIM_RULES.filter(function(r){ return r.key === k; })[0];
    return rule ? renderDimRow(rule) : '';
  }).join('');
  return '<div class="field"><div class="k">DIMENSIONS (\u03BB = '+formatNm(currentLambdaNm)+')</div><div class="v" style="margin-top:4px;">'+rows+'</div></div>';
}

lambdaSelect.addEventListener('change', function(e){
  currentLambdaNm = parseFloat(e.target.value);
  renderDimsTable();
  if (lastSelectedId) showInspector(lastSelectedId, idToInfo(lastSelectedId));
});

