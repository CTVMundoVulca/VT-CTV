/* Atualização automática dos apps CTV.
   Estratégia agressiva: checa por versão nova no load, a cada 30s,
   quando o app volta ao primeiro plano (visibilitychange), e quando a
   rede volta (online). Detecta SW em espera (waiting) e força ativação
   via postMessage. Recarrega automaticamente quando o novo SW assume,
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

  function ativarWaiting(sw) {
    if (sw) { try { sw.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {} }
  }

  function monitorarInstalacao(sw) {
    sw.addEventListener('statechange', function () {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) {
        ativarWaiting(sw);
      }
    });
  }

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) { hadController = true; return; }
    pending = true;
    tentarRecarregar();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).then(function (reg) {
      swReg = reg;

      if (reg.waiting) { ativarWaiting(reg.waiting); }
      if (reg.installing) { monitorarInstalacao(reg.installing); }

      reg.addEventListener('updatefound', function () {
        if (reg.installing) { monitorarInstalacao(reg.installing); }
      });

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

  setInterval(checarUpdate, 30000);

  document.addEventListener('focusout', function () { setTimeout(tentarRecarregar, 100); }, true);
})();
