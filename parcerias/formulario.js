/* =============================================================
   EndoAfetos — Parcerias: formulário de interesse
   O formulário não envia nada pelo site e não guarda nada. Ele só monta a
   mensagem e abre o e-mail ou o WhatsApp de quem escreve, que confere e
   envia por lá. O endereço e o número vêm dos atributos do formulário
   (data-email e data-whatsapp), gravados pelo gerador da página.
   Os campos entram na mensagem na ordem da página, com o rótulo de
   data-rotulo; um grupo de caixas (fieldset com data-rotulo) entra como
   uma linha só, com as opções marcadas.
   Sem script, o formulário abre o e-mail pelo próprio navegador (action
   mailto) e o botão do WhatsApp fica escondido: este script o mostra.
   ============================================================= */
(function () {
  'use strict';

  var form = document.getElementById('interesse-form');
  if (!form) { return; }

  var EMAIL = form.getAttribute('data-email') || '';
  var WHATSAPP = form.getAttribute('data-whatsapp') || '';
  // Acima disso, o Chrome e o Edge no Windows não passam o endereço mailto ao programa de e-mail (2048), e alguns
  // programas cortam o corpo: a mensagem vai copiada, para colar.
  var LIMITE_DO_MAILTO = 1800;
  var erro = document.getElementById('interesse-erro');
  var situacao = document.getElementById('interesse-situacao');
  var canal = 'email';
  var marcado = null;

  // O script confere os campos; sem ele, o navegador confere o required.
  form.noValidate = true;

  function texto(campo) {
    return typeof campo.value === 'string' ? campo.value.trim() : '';
  }

  function marcadosEm(grupo) {
    var lista = [];
    var caixas = grupo.querySelectorAll('input[type="checkbox"]:checked');
    for (var i = 0; i < caixas.length; i++) { lista.push(caixas[i].value); }
    return lista;
  }

  // Cada linha da mensagem: [rótulo, valor], na ordem da página, sem os campos vazios.
  function linhasDoFormulario() {
    var linhas = [];
    var itens = form.querySelectorAll('[data-rotulo]');
    for (var i = 0; i < itens.length; i++) {
      var item = itens[i];
      var valor = item.tagName === 'FIELDSET' ? marcadosEm(item).join('; ') : texto(item);
      if (valor) { linhas.push([item.getAttribute('data-rotulo'), valor]); }
    }
    return linhas;
  }

  function montarMensagem() {
    var partes = ['Olá, EndoAfetos! Quero conversar sobre uma parceria.', ''];
    var linhas = linhasDoFormulario();
    for (var i = 0; i < linhas.length; i++) { partes.push(linhas[i][0] + ': ' + linhas[i][1]); }
    var mensagem = form.elements.mensagem ? texto(form.elements.mensagem) : '';
    if (mensagem) { partes.push('', mensagem); }
    partes.push('', '(Mensagem montada na página de parcerias do site da EndoAfetos.)');
    return partes.join('\n');
  }

  // Os avisos ficam sempre na página (vazios quando não há nada a dizer): assim o leitor de tela anuncia a mudança.
  function mostrar(elemento, frase) {
    if (elemento) { elemento.textContent = frase; }
  }

  // Liga o aviso de erro ao campo com problema, e desliga do anterior.
  function marcar(campo) {
    if (marcado) {
      marcado.removeAttribute('aria-invalid');
      marcado.removeAttribute('aria-describedby');
    }
    marcado = campo || null;
    if (marcado) {
      marcado.setAttribute('aria-invalid', 'true');
      marcado.setAttribute('aria-describedby', 'interesse-erro');
    }
  }

  // O que falta preencher: o campo com problema, onde o foco vai, e a frase que explica. Nada faltando: null.
  function oQueFalta() {
    var nome = form.elements.nome;
    var instituicao = form.elements.instituicao;
    if (nome && !texto(nome)) { return { campo: nome, foco: nome, frase: 'Escreva o seu nome.' }; }
    if (instituicao && !texto(instituicao)) { return { campo: instituicao, foco: instituicao, frase: 'Escreva o nome da instituição ou da empresa.' }; }
    var grupo = form.querySelector('fieldset[data-rotulo]');
    var mensagem = form.elements.mensagem;
    if (grupo && marcadosEm(grupo).length === 0 && !(mensagem && texto(mensagem))) {
      return { campo: grupo, foco: grupo.querySelector('input'), frase: 'Marque pelo menos um interesse ou conte, na mensagem, o que vocês têm em mente.' };
    }
    return null;
  }

  function abrir(endereco, novaAba) {
    if (!novaAba) { window.location.href = endereco; return; }
    var janela = window.open(endereco, '_blank');
    if (janela) { janela.opener = null; } else { window.location.href = endereco; }
  }

  function copiar(mensagem, seFalhar) {
    var area = window.navigator && window.navigator.clipboard;
    if (!area || typeof area.writeText !== 'function') { seFalhar(); return; }
    var promessa = area.writeText(mensagem);
    if (promessa && typeof promessa.then === 'function') { promessa.then(null, seFalhar); }
  }

  function enviarPorEmail(mensagem) {
    var instituicao = form.elements.instituicao ? texto(form.elements.instituicao) : '';
    var assunto = 'Parceria com a EndoAfetos' + (instituicao ? ': ' + instituicao : '');
    var inicio = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(assunto) + '&body=';
    var endereco = inicio + encodeURIComponent(mensagem.replace(/\n/g, '\r\n'));
    if (endereco.length <= LIMITE_DO_MAILTO) {
      abrir(endereco, false);
      mostrar(situacao, 'A mensagem abriu no seu programa de e-mail. Confira e envie por lá. Se nada abriu, escreva para ' + EMAIL + '.');
      return;
    }
    var semCopia = function () {
      mostrar(situacao, 'A mensagem ficou longa para ir pelo e-mail e não deu para copiá-la. Encurte a mensagem, envie pelo WhatsApp ou escreva direto para ' + EMAIL + '.');
    };
    mostrar(situacao, 'A mensagem ficou longa para ir inteira pelo e-mail: ela foi copiada. Cole no corpo do e-mail que abriu, confira e envie.');
    copiar(mensagem, semCopia);
    abrir(inicio + encodeURIComponent('Cole aqui a mensagem que a página de parcerias copiou para você.'), false);
  }

  // O botão do WhatsApp só funciona com este script.
  var botaoDoWhatsapp = form.querySelector('button[data-canal="whatsapp"]');
  if (botaoDoWhatsapp) { botaoDoWhatsapp.hidden = false; }

  var botoes = form.querySelectorAll('button[data-canal]');
  for (var b = 0; b < botoes.length; b++) {
    botoes[b].addEventListener('click', function () { canal = this.getAttribute('data-canal'); });
  }

  form.addEventListener('submit', function (evento) {
    evento.preventDefault();
    // Navegador sem "submitter": vale o último botão clicado; Enter num campo, sem clique, vale o e-mail.
    if (evento.submitter && evento.submitter.getAttribute('data-canal')) { canal = evento.submitter.getAttribute('data-canal'); }
    var escolhido = canal;
    canal = 'email';
    var falta = oQueFalta();
    if (falta) {
      mostrar(situacao, '');
      mostrar(erro, falta.frase);
      marcar(falta.campo);
      if (falta.foco && typeof falta.foco.focus === 'function') { falta.foco.focus(); }
      return;
    }
    mostrar(erro, '');
    marcar(null);
    var mensagem = montarMensagem();
    if (escolhido === 'whatsapp') {
      abrir('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(mensagem), true);
      mostrar(situacao, 'A mensagem abriu no WhatsApp, numa aba nova. Confira e envie por lá. Se nada abriu, escreva para ' + EMAIL + '.');
    } else {
      enviarPorEmail(mensagem);
    }
  });

  // Ligações que já marcam um interesse no formulário (por exemplo, "Agendar uma demonstração").
  var atalhos = document.querySelectorAll('a[data-interesse]');
  for (var a = 0; a < atalhos.length; a++) {
    atalhos[a].addEventListener('click', function () {
      var caixa = document.getElementById(this.getAttribute('data-interesse'));
      if (caixa && caixa.type === 'checkbox') { caixa.checked = true; }
    });
  }
})();
