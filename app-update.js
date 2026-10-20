/* Atualização automática dos apps CTV.
   Baseado no mecanismo do Vulca Calc Pro: checa por versão nova toda vez
   que o app volta ao primeiro plano (visibilitychange) e quando a rede
   volta (online). Recarrega automaticamente quando o novo SW assume,
   mas protege formulários abertos para nunca perder dados em edição. */
(function () {
  if (!('serviceWorker' in navigator)) return;

  var refreshing = false;
  var pending = false;
  var hadController = !!navigator.serviceWorker.controller;
  var swReg = null;

  function editando() {
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return true;
    var ed = document.getElementById('view-editor');
    if (ed && ed.classList.contains('active')) return true;
    var po = document.getElementById('printOverlay');
    if (po && po.classList.contains('open')) return true;
    return false;
  }

  function tentarRecarregar() {
    if (!pending || refreshing) return;
    if (editando()) return;
    refreshing = true;
    try { location.reload(); } catch (e) {}
  }

  function checarUpdate() {
    if (swReg && swReg.update) { try { swReg.update(); } catch (e) {} }
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) { hadController = true; return; }
    pending = true;
    tentarRecarregar();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').then(function (reg) {
      swReg = reg;
      checarUpdate();
    }).catch(function () {});
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      checarUpdate();
      tentarRecarregar();
    }
  });

  window.addEventListener('online', checarUpdate);

  document.addEventListener('focusout', function () { setTimeout(tentarRecarregar, 100); }, true);
})();
