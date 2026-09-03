/* Catalog management is a live-catalog view. The lifecycle owner commits deletion. */
(function () {
  'use strict';
  let selectedAreaId = null, mobileDetail = false, menuClose = null, layerClose = null, dragCancel = null;
  let serial = 0;
  const areaId = area => area.id || TG_CATALOG.legacyAreaId(area.name);
  const areas = () => TG_CATALOG.areas(state.settings);
  const activities = () => TG_CATALOG.activities(state.settings);
  const current = (kind, id) => kind === 'area'
    ? areas().find(area => areaId(area) === id)
    : activities().find(activity => activity.id === id);
  const children = id => activities().filter(activity => activity.areaId === id || (!activity.areaId && activity.area === current('area', id)?.name));
  const mobile = () => window.matchMedia('(max-width:719px)').matches;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  function button(text, cls, handler, label) {
    const node = el('button', cls, text); node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', handler);
    return node;
  }
  function icon(name) {
    const paths = {
      more: '<circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="16" cy="10" r="1.6"/>',
      back: '<path d="m12 4-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
      next: '<path d="m8 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
      grip: '<circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/><circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/><circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/>'
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('fill', 'currentColor'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths[name];
    return svg;
  }
  function bookmark(kind, id, action = 'main') { return kind + ':' + id + ':' + action; }
  function focusKey(key) {
    const root = document.getElementById('catalogManager');
    const visible = node => node.getClientRects().length && !node.closest('[inert]');
    const target = [...(root?.querySelectorAll('[data-focus-key]') || [])].find(node => node.dataset.focusKey === key && visible(node));
    const fallback = [...(root?.querySelectorAll('.cm-add') || [])].find(visible);
    (target || fallback)?.focus({ preventScroll: true });
  }
  function persist(focus) {
    save(); renderAll(); renderCatalogManager();
    if (focus) focusKey(focus);
  }
  function closePickers() {
    if (typeof _closeAp === 'function') _closeAp();
    document.querySelectorAll('.cm-layer .cp-field').forEach(field => field._close?.());
  }
  function openLayer(title, triggerKey) {
    menuClose?.(false); layerClose?.(false); closePickers();
    const previous = document.activeElement;
    const layer = el('div', 'cm-layer');
    const backdrop = el('div', 'cm-backdrop');
    const dialog = el('section', 'cm-dialog');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    const heading = el('h3', 'cm-dialog-title', title); heading.id = 'cmDialogTitle' + (++serial);
    dialog.setAttribute('aria-labelledby', heading.id);
    const body = el('div', 'cm-dialog-body'), actions = el('div', 'cm-dialog-actions');
    const message = el('p', 'cm-message'); message.hidden = true; message.setAttribute('role', 'alert');
    dialog.append(heading, body, message, actions); layer.append(backdrop, dialog);
    const inertBefore = [...document.body.children].filter(node => !/^(SCRIPT|STYLE|LINK)$/.test(node.tagName)).map(node => [node, node.inert]);
    inertBefore.forEach(([node]) => { node.inert = true; });
    document.body.append(layer);
    let busy = false, closed = false;
    function close(restore = true) {
      if (closed || busy) return;
      closed = true; closePickers(); layer.remove();
      inertBefore.forEach(([node, wasInert]) => { if (node.isConnected) node.inert = wasInert; });
      document.removeEventListener('keydown', keydown, true);
      if (layerClose === close) layerClose = null;
      if (restore) {
        if (triggerKey) focusKey(triggerKey);
        else if (previous?.isConnected) previous.focus({ preventScroll: true });
      }
    }
    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (document.querySelector('.cm-layer .area-picker.open,.cm-layer .cp-sw.open')) closePickers();
        else close();
      }
      if (event.key !== 'Tab') return;
      const pop = document.querySelector('.cp-pop');
      const query = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]';
      const candidates = [...dialog.querySelectorAll(query), ...(pop ? pop.querySelectorAll(query) : [])].filter(node => node.getClientRects().length);
      const index = candidates.indexOf(document.activeElement);
      if (!candidates.length) { event.preventDefault(); return; }
      if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === candidates.length - 1))) {
        event.preventDefault(); candidates[event.shiftKey ? candidates.length - 1 : 0].focus();
      }
    }
    backdrop.addEventListener('click', () => close());
    document.addEventListener('keydown', keydown, true); layerClose = close;
    return {
      body, actions, heading, dialog, close,
      error(text) { message.textContent = text; message.hidden = !text; },
      busy(value) { busy = value; dialog.setAttribute('aria-busy', String(value)); actions.querySelectorAll('button').forEach(node => { node.disabled = value; }); }
    };
  }
  function rowNames(kind, id) {
    const item = current(kind, id);
    return { item, name: item?.name || '', label: kind === 'area' ? '영역' : '활동' };
  }
  function renameArea(item, name) {
    const id = areaId(item), old = item.name;
    const matches = value => value.areaId ? value.areaId === id : value.area === old;
    const update = value => { if (value && matches(value)) { value.area = name; value.areaId = id; } };
    state.settings.activities.forEach(update);
    (state.settings.routineDefs || []).forEach(update);
    Object.values(state.days || {}).forEach(day => {
      (day.todos || []).forEach(update); (day.routines || []).forEach(update);
      (day.todoMutations || []).forEach(mutation => update(mutation.todo));
    });
    item.name = name;
  }
  function edit(kind, id, triggerKey, focusArea = false) {
    const existing = id ? current(kind, id) : null;
    if (id && !existing) { renderCatalogManager(); return; }
    const label = kind === 'area' ? '영역' : '활동';
    const initialParent = existing?.areaId || selectedAreaId || areas()[0]?.id;
    const draft = { name: existing?.name || '', color: existing?.color || (kind === 'area' ? RAINBOW[areas().length % RAINBOW.length] : autoColor(current('area', initialParent)?.name || '')), parentId: initialParent };
    const initial = { ...draft };
    const layer = openLayer(label + (existing ? ' 편집' : ' 추가'), triggerKey);
    const nameField = el('div', 'cm-field');
    const nameLabel = el('label', 'cm-field-label', label + ' 이름');
    const input = el('input', 'cm-name-input'); input.type = 'text'; input.value = draft.name; input.autocomplete = 'off';
    input.id = 'cmName' + serial; nameLabel.htmlFor = input.id; nameField.append(nameLabel, input);
    const colorRow = el('div', 'cm-field cm-field-inline'); colorRow.append(el('span', 'cm-field-label', '색상'));
    const color = colorField(draft.color, value => { draft.color = value; }, { container: layer.dialog });
    color.querySelector('button')?.setAttribute('aria-label', label + ' 색상 선택'); colorRow.append(color);
    layer.body.append(nameField);
    let picker;
    if (kind === 'activity') {
      const parent = current('area', draft.parentId);
      const moveRow = el('div', 'cm-field cm-field-inline'); moveRow.append(el('span', 'cm-field-label', '영역'));
      picker = areaBtn(parent?.name || '', name => {
        draft.parentId = areas().find(area => area.name === name)?.id || null;
        if (!existing && draft.color === initial.color) { draft.color = autoColor(name); initial.color = draft.color; color._setColor(draft.color); }
      }, { container: layer.dialog });
      picker.setAttribute('aria-label', '활동 영역 선택'); moveRow.append(picker); layer.body.append(moveRow);
    }
    layer.body.append(colorRow);
    const cancel = button('취소', 'btn', () => layer.close());
    const submit = button(existing ? '저장' : '추가', 'btn dark', () => {
      layer.error('');
      const name = input.value.trim();
      if (!name) { layer.error('이름을 입력해 주세요.'); input.focus(); return; }
      const item = id ? current(kind, id) : null;
      if (id && !item) { layer.error('이미 삭제된 항목입니다. 닫은 후 목록을 확인해 주세요.'); return; }
      const duplicate = (kind === 'area' ? areas() : activities()).find(value => (kind === 'area' ? value.name === name : value.name.toLowerCase() === name.toLowerCase()) && (kind === 'area' ? areaId(value) : value.id) !== id);
      if (duplicate) {
        if (!id && kind === 'activity') {
          selectedAreaId = duplicate.areaId; mobileDetail = true;
          layer.close(false); renderCatalogManager(); focusKey(bookmark(kind, duplicate.id));
          toast('기존 활동을 사용합니다 · ' + duplicate.name); return;
        }
        layer.error('같은 이름의 ' + label + '이 이미 있습니다.'); input.focus(); return;
      }
      let targetId = id;
      if (kind === 'area') {
        if (item) {
          if (name !== initial.name) renameArea(item, name);
          if (draft.color !== initial.color) item.color = draft.color;
        } else {
          targetId = 'area_' + uid(); state.settings.areas.push({ id: targetId, name, color: draft.color });
          selectedAreaId = targetId;
        }
      } else {
        const parentId = item && draft.parentId === initial.parentId ? item.areaId : draft.parentId;
        const parent = current('area', parentId);
        if (!parent) { layer.error('선택한 영역이 없습니다. 영역을 다시 선택해 주세요.'); picker?.focus(); return; }
        if (item) {
          if (name !== initial.name) item.name = name;
          if (draft.parentId !== initial.parentId) moveActivity(item, parent.name);
          if (draft.color !== initial.color) item.color = draft.color;
        } else {
          targetId = uid(); state.settings.activities.push({ id: targetId, name, color: draft.color, area: parent.name, areaId: areaId(parent) });
        }
        selectedAreaId = areaId(parent); mobileDetail = true;
      }
      layer.close(false); persist(bookmark(kind, targetId));
    });
    layer.actions.append(cancel, submit);
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit.click(); } });
    if (focusArea && picker) picker.focus(); else { input.focus(); input.select(); }
  }
  function reorder(kind, id, destinationId, before) {
    const item = current(kind, id), destination = current(kind, destinationId);
    if (!item || !destination || id === destinationId) return;
    const key = kind === 'area' ? 'areas' : 'activities', values = state.settings[key];
    if (kind === 'activity' && item.areaId !== destination.areaId) moveActivity(item, destination.area);
    const from = values.indexOf(item); if (from < 0) return;
    values.splice(from, 1);
    const index = values.indexOf(destination); values.splice(index + (before ? 0 : 1), 0, item);
    persist(bookmark(kind, id, 'more'));
  }
  function step(kind, id, delta) {
    const item = current(kind, id); if (!item) return;
    const siblings = kind === 'area' ? areas() : children(item.areaId);
    const index = siblings.findIndex(value => (kind === 'area' ? areaId(value) : value.id) === id);
    const destination = siblings[index + delta];
    if (destination) reorder(kind, id, kind === 'area' ? areaId(destination) : destination.id, delta < 0);
  }
  const errors = {
    CATALOG_RUNNING: '이 항목을 측정 중입니다. 측정을 먼저 중지하고 기록 저장이 끝난 후 삭제해 주세요.',
    CATALOG_FINALIZING: '중지한 측정 기록을 저장하고 있습니다. 저장이 끝난 후 다시 삭제해 주세요.',
    CATALOG_PREVIEW_CHANGED: '항목이 변경되었습니다. 아래의 삭제 대상을 다시 확인해 주세요.',
    CATALOG_TARGET_MISSING: '이미 삭제된 항목입니다. 닫은 후 목록을 확인해 주세요.',
    'cloud-unavailable': '서버 연결을 확인할 수 없습니다. 연결과 동기화가 완료된 후 다시 시도해 주세요.',
    CATALOG_CLEANUP_PENDING: '삭제는 반영됐지만 일부 할일·루틴의 연결 정리가 남아 있습니다. 기록은 보존되어 있습니다. 정리를 다시 시도해 주세요.',
    CATALOG_UPGRADE_REQUIRED: '분류 관리 업데이트가 필요합니다. 측정과 기록 동기화를 마친 후 새 버전으로 업데이트해 주세요.',
    CATALOG_STORAGE: '기록을 안전하게 저장하지 못했습니다. 저장 공간과 동기화 상태를 확인해 주세요.',
    storage: '기록을 안전하게 저장하지 못했습니다. 저장 공간과 동기화 상태를 확인해 주세요.',
    CATALOG_OPERATION_TOO_LARGE: '한 번에 처리할 수 있는 범위를 초과했습니다. 활동을 나누어 삭제한 후 영역을 삭제해 주세요.'
  };
  function remove(kind, id, triggerKey) {
    const { item, label } = rowNames(kind, id); if (!item) return;
    const priorRows = kind === 'area' ? areas() : children(item.areaId);
    const priorIndex = priorRows.findIndex(value => (kind === 'area' ? areaId(value) : value.id) === id);
    let preview, cleanupPending = false;
    try { preview = TG_CATALOG.preview(state.settings, kind, id, state.days); }
    catch (_) { renderCatalogManager(); return; }
    const layer = openLayer(label + ' 삭제', triggerKey);
    const target = el('p', 'cm-delete-target');
    const summary = el('p', 'cm-delete-copy', kind === 'area'
      ? '연결된 할일·루틴의 영역과 활동은 공란이 됩니다. 할일·루틴 자체와 기존 측정 기록·통계는 남습니다.'
      : '연결된 할일·루틴의 활동은 공란이 되고 영역은 유지됩니다. 기존 측정 기록·통계는 남습니다.');
    const childBox = el('div', 'cm-delete-children'), childTitle = el('p', 'cm-field-label');
    const childList = el('ul', 'cm-child-list'); childBox.append(childTitle, childList);
    const affected = el('p', 'cm-delete-count');
    function draw() {
      const name = (kind === 'area' ? preview.areas[0] : preview.activities[0])?.name || item.name;
      target.textContent = '“' + name + '”' + (kind === 'area' ? ' 영역을 삭제할까요?' : ' 활동을 삭제할까요?');
      childBox.hidden = kind !== 'area' || !preview.activities.length;
      childTitle.textContent = '함께 삭제할 활동 ' + preview.activities.length + '개';
      childList.replaceChildren(...preview.activities.map(activity => el('li', '', activity.name)));
      affected.textContent = '현재 연결된 할일 ' + (preview.todos || 0) + '개 · 루틴 ' + (preview.routines || 0) + '개';
    }
    draw(); layer.body.append(target, childBox, summary, affected);
    const cancel = button('취소', 'btn', () => layer.close());
    const confirm = button('삭제', 'btn cm-danger', async () => {
      layer.error(''); layer.busy(true); confirm.textContent = cleanupPending ? '정리 중…' : '확인 중…';
      try {
        if (typeof window.tgCloud?.deleteCatalog !== 'function') throw new Error('cloud-unavailable');
        const result = await window.tgCloud.deleteCatalog(preview);
        if (result === false) throw new Error('CATALOG_STORAGE');
        layer.busy(false); layer.close(false);
        if (!current('area', selectedAreaId)) { selectedAreaId = null; mobileDetail = false; }
        renderAll(); renderCatalogManager();
        const rows = kind === 'area' ? areas() : children(selectedAreaId);
        const next = rows[Math.min(Math.max(priorIndex, 0), rows.length - 1)];
        focusKey(next ? bookmark(kind, kind === 'area' ? areaId(next) : next.id) : (kind === 'area' ? 'add-area' : 'add-activity'));
        toast(label + '을 삭제했습니다. 기존 기록은 유지됩니다.');
      } catch (error) {
        const code = String(error?.code || error?.message || '');
        if (code.includes('CATALOG_PREVIEW_CHANGED')) {
          try { preview = TG_CATALOG.preview(state.settings, kind, id, state.days); draw(); } catch (_) { /* The target can disappear while refreshing. */ }
        }
        cleanupPending = code.includes('CATALOG_CLEANUP_PENDING');
        const matching = Object.keys(errors).find(key => code.includes(key));
        layer.error(matching ? errors[matching] : '삭제를 완료하지 못했습니다. 연결과 기록 저장 상태를 확인한 후 다시 시도해 주세요.');
        layer.busy(false); confirm.textContent = cleanupPending ? '정리 다시 시도' : '삭제';
        cancel.textContent = cleanupPending ? '닫기' : '취소'; cancel.focus();
      }
    });
    layer.actions.append(cancel, confirm); cancel.focus();
  }
  function openMenu(kind, id, trigger) {
    menuClose?.(false);
    const item = current(kind, id); if (!item) return;
    const key = trigger.dataset.focusKey || bookmark(kind, id, 'more');
    const menu = el('div', 'cm-menu'); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', item.name + ' 관리');
    const items = [];
    function add(text, handler, disabled, danger) {
      const node = button(text, 'cm-menu-item' + (danger ? ' cm-menu-danger' : ''), () => { close(false); handler(); });
      node.setAttribute('role', 'menuitem'); node.disabled = !!disabled; menu.append(node); items.push(node);
    }
    add('이름 · 색상 편집', () => edit(kind, id, key));
    if (kind === 'activity') add('다른 영역으로 이동', () => edit(kind, id, key, true));
    else add('활동 자동 배색', () => { const area = current(kind, id); if (area) autoColorActs(area.name); focusKey(key); }, !children(id).length);
    const list = kind === 'area' ? areas() : children(item.areaId);
    const position = list.indexOf(item);
    menu.append(el('div', 'cm-menu-divider'));
    add('위로 이동', () => step(kind, id, -1), position <= 0);
    add('아래로 이동', () => step(kind, id, 1), position === list.length - 1);
    menu.append(el('div', 'cm-menu-divider'));
    add('삭제', () => remove(kind, id, key), false, true);
    document.body.append(menu); trigger.setAttribute('aria-expanded', 'true');
    function positionMenu() {
      if (!trigger.isConnected) { close(false); return; }
      const rect = trigger.getBoundingClientRect(), view = window.visualViewport;
      const width = view?.width || window.innerWidth, height = view?.height || window.innerHeight;
      const x = view?.offsetLeft || 0, y = view?.offsetTop || 0;
      menu.style.left = Math.max(x + 8, Math.min(rect.right - menu.offsetWidth, x + width - menu.offsetWidth - 8)) + 'px';
      const top = rect.bottom + 6 + menu.offsetHeight <= y + height - 8 ? rect.bottom + 6 : rect.top - menu.offsetHeight - 6;
      menu.style.top = Math.max(y + 8, top) + 'px';
    }
    function close(restore = true) {
      menu.remove(); trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', positionMenu); document.removeEventListener('scroll', positionMenu, true);
      if (menuClose === close) menuClose = null;
      if (restore) focusKey(key);
    }
    function outside(event) { if (!menu.contains(event.target) && !trigger.contains(event.target)) close(false); }
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'Tab') { close(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const enabled = items.filter(node => !node.disabled), index = enabled.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length;
      enabled[next]?.focus();
    }
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', positionMenu); document.addEventListener('scroll', positionMenu, true);
    menuClose = close; positionMenu(); items[0].focus();
  }
  function attachDrag(handle, row, kind, id) {
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.isPrimary === false || dragCancel) return;
      event.stopPropagation();
      const pointerId = event.pointerId, startX = event.clientX, startY = event.clientY;
      let ghost = null, drop = null, moved = false;
      handle.setPointerCapture(pointerId);
      function clearHints() { document.querySelectorAll('.cm-drop-before,.cm-drop-after,.cm-drop-area').forEach(node => node.classList.remove('cm-drop-before', 'cm-drop-after', 'cm-drop-area')); }
      function move(moveEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return;
        moveEvent.preventDefault(); moved = true;
        if (!ghost) {
          const rect = row.getBoundingClientRect(); ghost = row.cloneNode(true); ghost.className = 'cm-row cm-drag-ghost';
          ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true; ghost.style.width = rect.width + 'px'; ghost.style.top = rect.top + 'px'; ghost.style.left = rect.left + 'px';
          ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id')); document.body.append(ghost); row.classList.add('cm-drag-origin');
        }
        ghost.style.transform = 'translate3d(' + (moveEvent.clientX - startX) + 'px,' + (moveEvent.clientY - startY) + 'px,0)';
        clearHints(); drop = null;
        const hit = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.cm-row');
        if (!hit || hit === row) return;
        if (kind === 'activity' && hit.dataset.kind === 'area') {
          hit.classList.add('cm-drop-area'); drop = { area: hit.dataset.id };
        } else if (hit.dataset.kind === kind) {
          const rect = hit.getBoundingClientRect(), before = moveEvent.clientY < rect.top + rect.height / 2;
          hit.classList.add(before ? 'cm-drop-before' : 'cm-drop-after'); drop = { id: hit.dataset.id, before };
        }
        const scroller = document.querySelector('#actsDlg .dlg-body');
        if (scroller) {
          const rect = scroller.getBoundingClientRect();
          if (moveEvent.clientY < rect.top + 40) scroller.scrollTop -= 14;
          else if (moveEvent.clientY > rect.bottom - 40) scroller.scrollTop += 14;
        }
      }
      function finish(finishEvent, cancelled) {
        if (finishEvent && finishEvent.pointerId !== pointerId) return;
        const destination = drop;
        ghost?.remove(); row.classList.remove('cm-drag-origin'); clearHints();
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', cancel); handle.removeEventListener('lostpointercapture', cancel);
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        dragCancel = null;
        if (moved) { handle.dataset.dragged = 'true'; setTimeout(() => { delete handle.dataset.dragged; }, 0); }
        if (cancelled || !moved || !destination) return;
        if (destination.area) {
          const item = current(kind, id), parent = current('area', destination.area);
          if (item && parent && item.areaId !== areaId(parent)) {
            moveActivity(item, parent.name); selectedAreaId = areaId(parent); persist(bookmark(kind, id));
          }
        } else reorder(kind, id, destination.id, destination.before);
      }
      const up = event => finish(event, false), cancel = event => finish(event, true);
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', cancel); handle.addEventListener('lostpointercapture', cancel);
      dragCancel = () => finish(null, true);
    });
  }
  function catalogRow(kind, item) {
    const id = kind === 'area' ? areaId(item) : item.id;
    const row = el('div', 'cm-row'); row.dataset.kind = kind; row.dataset.id = id;
    if (kind === 'area' && id === selectedAreaId) row.classList.add('cm-selected');
    const grip = button('', 'cm-grip', event => { if (!grip.dataset.dragged) openMenu(kind, id, event.currentTarget); }, item.name + ' 순서 변경'); grip.append(icon('grip'));
    grip.dataset.focusKey = bookmark(kind, id, 'grip');
    grip.addEventListener('keydown', event => {
      if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); step(kind, id, event.key === 'ArrowUp' ? -1 : 1); }
    });
    attachDrag(grip, row, kind, id);
    const main = button('', 'cm-row-main', () => {
      if (kind === 'area') {
        selectedAreaId = id; mobileDetail = true; renderCatalogManager();
        if (mobile()) document.getElementById('cmActivityHeading')?.focus({ preventScroll: true });
      } else edit(kind, id, bookmark(kind, id));
    });
    main.dataset.focusKey = bookmark(kind, id);
    if (kind === 'area') main.setAttribute('aria-current', String(id === selectedAreaId));
    const dot = el('span', 'cm-dot'); dot.style.background = safeHexColor(item.color); dot.setAttribute('aria-hidden', 'true');
    const name = el('span', 'cm-row-name', item.name); main.append(dot, name);
    if (kind === 'area') { const count = el('span', 'cm-count', String(children(id).length)); count.setAttribute('aria-label', '활동 ' + children(id).length + '개'); main.append(count); }
    const more = button('', 'cm-more', event => openMenu(kind, id, event.currentTarget), item.name + ' 관리');
    more.dataset.focusKey = bookmark(kind, id, 'more'); more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false'); more.append(icon('more'));
    row.append(grip, main, more); return row;
  }
  function renderCatalogManager() {
    const root = document.getElementById('catalogManager'); if (!root) return;
    menuClose?.(false); dragCancel?.();
    const allAreas = areas();
    if (!allAreas.some(area => areaId(area) === selectedAreaId)) { selectedAreaId = allAreas[0] ? areaId(allAreas[0]) : null; mobileDetail = false; }
    root.className = 'cm-manager' + (mobileDetail ? ' cm-detail' : ''); root.replaceChildren();
    const nav = el('section', 'cm-areas'), head = el('div', 'cm-section-head');
    const title = el('h4', 'cm-heading', '영역'); title.id = 'cmAreaHeading';
    const total = el('span', 'cm-count', String(allAreas.length)); title.append(total);
    const paint = button('자동 배색', 'btn cm-quiet', () => { autoColorAll(); focusKey('auto-color'); });
    paint.dataset.focusKey = 'auto-color'; paint.disabled = !allAreas.length;
    head.append(title, paint); nav.append(head); nav.setAttribute('aria-labelledby', title.id);
    const areaList = el('div', 'cm-list'); allAreas.forEach(area => areaList.append(catalogRow('area', area))); nav.append(areaList);
    if (!allAreas.length) nav.append(el('p', 'cm-empty', '영역을 추가해 활동을 정리해 보세요.'));
    const addArea = button('＋ 영역 추가', 'btn add-line cm-add', () => edit('area', null, 'add-area')); addArea.dataset.focusKey = 'add-area'; nav.append(addArea);
    const content = el('section', 'cm-activities');
    const back = button('', 'cm-back', () => { mobileDetail = false; renderCatalogManager(); focusKey(bookmark('area', selectedAreaId)); }, '영역 목록으로 돌아가기'); back.append(icon('back'), el('span', '', '영역')); content.append(back);
    const selected = current('area', selectedAreaId);
    if (selected) {
      const list = children(selectedAreaId), contentHead = el('div', 'cm-section-head');
      const heading = el('h4', 'cm-heading', selected.name); heading.id = 'cmActivityHeading'; heading.tabIndex = -1; heading.append(el('span', 'cm-count', String(list.length)));
      const areaMore = button('', 'cm-more', event => openMenu('area', selectedAreaId, event.currentTarget), selected.name + ' 영역 관리'); areaMore.append(icon('more')); areaMore.setAttribute('aria-haspopup', 'menu'); areaMore.dataset.focusKey = 'selected-area-more';
      contentHead.append(heading, areaMore); content.append(contentHead); content.setAttribute('aria-labelledby', heading.id);
      const activityList = el('div', 'cm-list'); list.forEach(activity => activityList.append(catalogRow('activity', activity))); content.append(activityList);
      if (!list.length) content.append(el('p', 'cm-empty', '아직 활동이 없습니다.'));
      const add = button('＋ 활동 추가', 'btn add-line cm-add', () => edit('activity', null, 'add-activity')); add.dataset.focusKey = 'add-activity'; content.append(add);
    } else { content.append(el('p', 'cm-empty cm-empty-context', '영역을 선택하면 활동이 표시됩니다.')); }
    root.append(nav, content);
  }
  window.renderCatalogManager = renderCatalogManager;
  window.cancelCatalogManagerDrag = () => { dragCancel?.(); };
  window.closeCatalogManagerLayers = () => { menuClose?.(false); layerClose?.(false); dragCancel?.(); };
})();
