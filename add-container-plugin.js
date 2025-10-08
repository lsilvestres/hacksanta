/* arquivo: add-container-plugin.js */
/* Requer integração com o script principal via window.integratePatioApi(api) ao final da inicialização. */

(() => {
  'use strict';

  // UI elements
  const actions = document.getElementById('actions') || document.body;

  // Styles for dialog and moves panel
  const style = document.createElement('style');
  style.textContent = `
  .acp-btn { background:#1f2937; color:#e5e7eb; border:1px solid #374151; padding:6px 10px; border-radius:6px; cursor:pointer; }
  .acp-btn:hover { background:#111827; }
  dialog#acp-dialog { border:none; border-radius:10px; padding:0; max-width:420px; width:92vw; color:#e5e7eb; }
  dialog#acp-dialog::backdrop { background:rgba(2,6,23,.65); }
  .acp-modal { background:#0f172a; border:1px solid #374151; border-radius:10px; overflow:hidden; }
  .acp-hd { padding:12px 14px; border-bottom:1px solid #374151; font-weight:600; }
  .acp-bd { padding:14px; display:grid; gap:12px; }
  .acp-row { display:grid; gap:6px; }
  .acp-row label { font-size:12px; opacity:.9; }
  .acp-row input { background:#0b1220; color:#e5e7eb; border:1px solid #374151; border-radius:6px; padding:8px 10px; }
  .acp-ft { display:flex; gap:8px; justify-content:flex-end; padding:12px 14px; border-top:1px solid #374151; }
  .acp-btn-sec { background:#111827; }
  .acp-badge { display:inline-block; font-size:11px; padding:2px 6px; border:1px solid #374151; border-radius:999px; margin-left:6px; }
  #acp-moves { position:absolute; right:12px; top:calc(60px + var(--panel-offset, 0px)); background:#111827dd; border:1px solid #374151; border-radius:8px; width:min(440px, 92vw); z-index:12; }
  #acp-moves[hidden]{ display:none; }
  #acp-moves details summary { padding:10px 12px; cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; }
  #acp-moves details summary::-webkit-details-marker { display:none; }
  #acp-moves details[open] summary { border-bottom:1px solid #374151; }
  #acp-moves .acp-mv-body { max-height:260px; overflow:auto; padding:10px 12px; }
  #acp-moves ul { margin:0; padding:0; list-style:none; font-size:12px; }
  #acp-moves li { padding:6px 0; border-bottom:1px solid #182033; white-space:pre-wrap; }
  `;
  document.head.appendChild(style);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'acp-btn';
  addBtn.id = 'acp-add';
  addBtn.textContent = 'Adicionar contêiner';
  (document.getElementById('actions') || document.body).appendChild(addBtn);

  // Moves panel
  const movesPanel = document.createElement('div');
  movesPanel.id = 'acp-moves';
  movesPanel.hidden = true;
  movesPanel.innerHTML = `
    <details open>
      <summary>
        <span>Movimentações da inserção</span>
        <span class="acp-badge" id="acp-moves-count">0 mov.</span>
      </summary>
      <div class="acp-mv-body">
        <ul id="acp-moves-list"></ul>
      </div>
    </details>
  `;
  document.getElementById('app').appendChild(movesPanel);

  // Dialog
  const dlg = document.createElement('dialog');
  dlg.id = 'acp-dialog';
  dlg.innerHTML = `
    <div class="acp-modal">
      <div class="acp-hd">Adicionar contêiner</div>
      <form method="dialog" id="acp-form">
        <div class="acp-bd">
          <div class="acp-row">
            <label for="acp-code">Código do contêiner</label>
            <input id="acp-code" name="code" type="text" inputmode="latin" autocomplete="off" placeholder="ABC1234567" required>
          </div>
          <div class="acp-row">
            <label for="acp-out">Saída (YYYY-MM-DD)</label>
            <input id="acp-out" name="out" type="date" required>
          </div>
          <div class="acp-row">
            <label>Entrada</label>
            <input id="acp-in" type="text" readonly>
          </div>
        </div>
        <div class="acp-ft">
          <button class="acp-btn acp-btn-sec" value="cancel">Cancelar</button>
          <button class="acp-btn" id="acp-submit" value="ok">Adicionar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(dlg);

  // Dialog behavior (show/close)
  const today = new Date().toISOString().slice(0,10);
  const codeEl = dlg.querySelector('#acp-code');
  const outEl  = dlg.querySelector('#acp-out');
  const inEl   = dlg.querySelector('#acp-in');
  const submitEl = dlg.querySelector('#acp-submit');
  inEl.value = today;
  outEl.valueAsDate = new Date();

  addBtn.addEventListener('click', () => {
    codeEl.value = '';
    outEl.valueAsDate = new Date();
    inEl.value = today;
    dlg.showModal(); // abre modal nativo
  }); // MDN dialog API [web:64][web:73]

  // API bridge (to be registered by main script)
  let api = null;
  window.integratePatioApi = function registerApi(exposed){
    api = exposed;
  };

  // Helpers: parse patio piles, plan insertion, rebuild data
  function key(b,r){ return `${b}-${r}`; }

  function buildPiles(p){
    const piles = new Map();
    for(let b=1;b<=p.bays;b++){
      for(let r=1;r<=p.rows;r++){
        piles.set(key(b,r), []);
      }
    }
    const sorted = [...p.data].sort((a,b)=> a.bay-b.bay || a.row-b.row || a.stack-b.stack);
    for(const c of sorted){
      piles.get(key(c.bay,c.row)).push({...c});
    }
    return piles;
  }

  function totalFreeCapacity(p, piles){
    let free = 0;
    for(let b=1;b<=p.bays;b++){
      for(let r=1;r<=p.rows;r++){
        const pile = piles.get(key(b,r)) || [];
        free += Math.max(0, p.stacks - pile.length);
      }
    }
    return free;
  }

  // Compute blocking count at top for placing newC (we want all with saida <= newC.saida above it)
  function blockingTopCount(pile, newC){
    let c = 0;
    for(let i=pile.length-1;i>=0;i--){
      if(new Date(pile[i].saida) <= new Date(newC.saida)) c++;
      else break;
    }
    return c;
  }

  // Choose target pile with minimal moves and feasible buffer capacity
  function chooseTarget(p, piles, newC){
    let best = null;
    for(let b=1;b<=p.bays;b++){
      for(let r=1;r<=p.rows;r++){
        const k = key(b,r);
        const pile = piles.get(k);
        const h = pile.length;
        if(h >= p.stacks) {
          // needs at least one removal to create space
          // still consider if we can free space by temporary moves
        }
        const block = blockingTopCount(pile, newC);
        // Moves = remove 'block' + place 1 + return 'block' (if any) + maybe remove extra to create space if full
        let extraToFreeSpace = Math.max(0, (h - (p.stacks - 1))); // if full, remove 1 to create room (handled within block if block>0)
        let needRemove = Math.max(block, extraToFreeSpace);
        const moves = needRemove + 1 + block; // removes + place + returns
        // Check buffer feasibility: total free slots in other piles
        let free = 0;
        for(let bb=1;bb<=p.bays;bb++){
          for(let rr=1;rr<=p.rows;rr++){
            if(bb===b && rr===r) continue;
            free += Math.max(0, p.stacks - (piles.get(key(bb,rr)).length));
          }
        }
        if(free < needRemove) continue; // not feasible
        if(!best || moves < best.moves){
          best = { b, r, moves, block, needRemove };
        }
      }
    }
    return best;
  }

  // Plan moves: returns {movesLog, newData}
  function planInsertion(p, newC){
    const piles = buildPiles(p);
    const choice = chooseTarget(p, piles, newC);
    if(!choice) throw new Error('Sem capacidade temporária para inserir.');
    const { b:tb, r:tr, block, needRemove } = choice;
    const targetK = key(tb,tr);
    const targetPile = piles.get(targetK);

    const moves = [];
    const removed = []; // stack of removed in order of removal (top-down)
    const tempDest = []; // records to which pile each removed went

    // Remove needed containers from target top
    for(let i=0;i<needRemove;i++){
      const c = targetPile.pop();
      if(!c) break;
      removed.push(c);
      moves.push(`${c.container} → Bay ${c.bay} Row ${c.row} (Tier ${c.stack})`);
      // Push into first available buffer pile
      let placed = false;
      for(let bb=1;bb<=p.bays && !placed;bb++){
        for(let rr=1;rr<=p.rows && !placed;rr++){
          if(bb===tb && rr===tr) continue;
          const pk = key(bb,rr);
          const pile = piles.get(pk);
          if(pile.length < p.stacks){
            pile.push({...c, bay:bb, row:rr, stack:pile.length+1});
            tempDest.push({ from:c, toK:pk });
            placed = true;
          }
        }
      }
      if(!placed) throw new Error('Falha ao alocar temporários.');
    }

    // Place the new container on target
    const newStack = targetPile.length + 1;
    targetPile.push({
      bay: tb, row: tr, stack: newStack,
      container: newC.container, entrada: newC.entrada, saida: newC.saida
    });
    moves.push(`${newC.container} ← Bay ${tb} Row ${tr} (Tier ${newStack})`);

    // Return previously removed ones back to target, in reverse order
    for(let i=tempDest.length-1;i>=0;i--){
      const temp = tempDest[i];
      const fromK = temp.toK;
      const fromPile = piles.get(fromK);
      const c = fromPile.pop();
      // push back to target
      const s = targetPile.length + 1;
      targetPile.push({...c, bay:tb, row:tr, stack:s});
      moves.push(`${c.container} ← Bay ${tb} Row ${tr} (Tier ${s})`);
    }

    // Rebuild flat data array sorted by bay,row,stack
    const newData = [];
    for(let bb=1;bb<=p.bays;bb++){
      for(let rr=1;rr<=p.rows;rr++){
        const pk = key(bb,rr);
        const pile = piles.get(pk);
        for(let s=0;s<pile.length;s++){
          const c = pile[s];
          newData.push({ bay: bb, row: rr, stack: s+1, container: c.container, entrada: c.entrada, saida: c.saida });
        }
      }
    }
    newData.sort((a,b)=> a.bay-b.bay || a.row-b.row || a.stack-b.stack);

    return { moves, data: newData };
  }

  // Render moves log
  function showMoves(moves){
    const list = document.getElementById('acp-moves-list');
    const count = document.getElementById('acp-moves-count');
    list.innerHTML = '';
    moves.forEach(line => {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    });
    count.textContent = `${moves.length} mov.`;
    movesPanel.hidden = false;
  }

  // Submit handler
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return;
  });

  submitEl.addEventListener('click', (e) => {
    e.preventDefault();
    const code = (codeEl.value || '').trim().toUpperCase();
    const saida = outEl.value;
    const entrada = today;
    if(!code || !saida){
      return;
    }
    if(!api){
      alert('API do pátio não registrada. Chame window.integratePatioApi({...}).');
      return;
    }
    try {
      // Get current patio from API
      const p0 = api.getPatio();
      // Prevent duplicate container code
      if(p0.data.some(x => x.container === code)){
        alert('Contêiner já existente.');
        return;
      }
      const p = { bays:p0.bays, rows:p0.rows, stacks:p0.stacks, data:[...p0.data] };
      const result = planInsertion(p, { container: code, entrada, saida });
      // Apply new patio
      api.setPatio({ bays:p.bays, rows:p.rows, stacks:p.stacks, data: result.data });
      if(api.rebuildInstances) api.rebuildInstances();
      if(api.rebuildGrid) api.rebuildGrid();
      showMoves(result.moves);
      dlg.close();
    } catch(err){
      console.error(err);
      alert('Não foi possível inserir: ' + err.message);
    }
  });

  // Expose a minimal fallback API registration example for convenience
  // window.integratePatioApi({ getPatio(){...}, setPatio(p){...}, rebuildInstances(){...}, rebuildGrid(){...} });

})();
