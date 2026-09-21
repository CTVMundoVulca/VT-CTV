/* Atualização automática dos apps CTV.
   Registra o service worker e, quando uma nova versão é publicada,
   recarrega a página sozinho — mas só quando é SEGURO (não recarrega
   enquanto você digita, com um campo em foco, ou com um RDO aberto em
   edição), para nunca perder o que está sendo preenchido. */
(function () {
  if (!('serviceWorker' in navigator)) return;

  var refreshing = false;
  var pending = false;
  var hadController = !!navigator.serviceWorker.controller;

  function editando() {
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return true;
    // RDO: não recarrega com o editor de RDO aberto
    var ed = document.getElementById('view-editor');
    if (ed && ed.classList.contains('active')) return true;
    // Tela de impressão/PDF aberta
    var po = document.getElementById('printOverlay');
    if (po && po.classList.contains('open')) return true;
    return false;
  }

  function tentarRecarregar() {
    if (!pending || refreshing) return;
    if (editando()) return;          // adia até ficar seguro
    refreshing = true;
    try { location.reload(); } catch (e) {}
  }

  // Nova versão assumiu o controle → recarrega.
  // A PRIMEIRA ativação (instalação inicial, quando ainda não havia SW) é
  // ignorada; a partir daí, cada troca de versão dispara o recarregamento.
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) { hadController = true; return; }
    pending = true;
    tentarRecarregar();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').then(function (reg) {
      reg.update();
      // verifica atualização periodicamente
      setInterval(function () { try { reg.update(); } catch (e) {} }, 60 * 60 * 1000);
    }).catch(function () {});
  });

  // ao voltar o foco/visibilidade, verifica atualização e recarrega se estiver pendente
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then(function (r) { if (r) { try { r.update(); } catch (e) {} } });
      tentarRecarregar();
    }
  });
  // quando um campo perde o foco, tenta recarregar (se houver atualização pendente)
  document.addEventListener('focusout', function () { setTimeout(tentarRecarregar, 100); }, true);
})();
