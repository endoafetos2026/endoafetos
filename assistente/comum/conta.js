/* ==== CARA:INICIO ==== */
// Chave da cara da pagina: "atual" (a de hoje) ou "v1" (a cara nova, para conferencia). O padrao vem gravado no
// proprio <html> pelo gerador (ferramentas/gerar-paginas.mjs): sem atributo e a de hoje; data-cara="v1" e a nova. O
// endereco com ?cara=v1 ou ?cara=atual
// troca so nesta visita, e os links da propria pagina levam a escolha adiante. Nada e guardado no navegador.
(function () {
  "use strict";
  if (typeof document === "undefined" || !document.documentElement || typeof window === "undefined") return;
  var raiz = document.documentElement;
  var busca = "";
  try {
    busca = String((window.location && window.location.search) || "");
  } catch (erro) {
    busca = "";
  }
  var pedido = /(?:^\?|&)cara=(v1|atual)(?:&|$)/.exec(busca);
  if (!pedido || pedido[1] === (raiz.getAttribute("data-cara") || "atual")) return;
  var escolha = pedido[1];
  raiz.setAttribute("data-cara", escolha);
  // Leva a escolha para os links do proprio site (caminho relativo), na hora do toque: vale tambem para os links
  // que o script cria depois. Link de fora, de telefone, de e-mail ou da mesma pagina (#) fica como esta.
  document.addEventListener("click", function (evento) {
    var alvo = evento.target;
    while (alvo && alvo.nodeType === 1 && String(alvo.nodeName).toLowerCase() !== "a") alvo = alvo.parentNode;
    if (!alvo || alvo.nodeType !== 1 || !alvo.getAttribute) return;
    var destino = alvo.getAttribute("href");
    if (typeof destino !== "string" || destino === "" || destino.charAt(0) === "#") return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(destino) || destino.indexOf("//") === 0 || /[?&]cara=/.test(destino)) return;
    var marca = destino.indexOf("#");
    var antes = marca === -1 ? destino : destino.slice(0, marca);
    var depois = marca === -1 ? "" : destino.slice(marca);
    alvo.setAttribute("href", antes + (antes.indexOf("?") === -1 ? "?" : "&") + "cara=" + escolha + depois);
  }, true);
})();
/* ==== CARA:FIM ==== */
/* Peças comuns das páginas de planos, inscrição, pagamento e conta (24/11/2026).
   Nada aqui é segredo: CONFIG.api é o endereço público do Worker e CONFIG.turnstile_sitekey é a chave pública do
   Turnstile. Os dois ficam preenchidos no repositório, com os valores publicados. Com CONFIG.api vazio, as páginas
   mostram o estado "em breve" e não fazem pedido nenhum.
   Todo texto vindo do servidor entra por textContent, nunca como marcação. */
(function (raiz) {
  "use strict";

  var CONFIG = {
    api: "https://endoafetos-api.endoafetos.workers.dev",
    turnstile_sitekey: "0x4AAAAAAGI2ABZoxe7E4K2n",
    espera_ms: 15000,
    // Prazo para o Turnstile entregar a ficha; sem ela, a página avisa e o botão volta, nunca fica parada.
    espera_turnstile_ms: 30000,
    // Passado este tempo sem a ficha, a página diz que a verificação está demorando, para não parecer parada.
    aviso_turnstile_ms: 8000,
    // Planos e preços para mostrar (os que valem são os do servidor, src/planos.mjs). O anual vale 10 mensalidades.
    // 27/11 (painel da usuária): nos pagos, as perguntas do dia acumulam na semana, que renova na sexta às 00h01; a
    // bitácora e os relatórios são só do Completo. O gratuito tem 3 perguntas por semana, na mesma renovação.
    planos: {
      essencial: { nome: "Essencial", mensal: 1490, anual: 14900, limite_diario: 10, acumula: true, bitacora: false, relatorios: 0 },
      completo: { nome: "Completo", mensal: 2490, anual: 24900, limite_diario: 15, acumula: true, bitacora: true, relatorios: 2 }
    },
    gratuito: { nome: "Gratuito", limite_semanal: 3 }
  };

  // Frases dos códigos de erro das rotas de conta e pagamento. O Worker não manda frase para esses códigos.
  var ERROS = {
    inscricao_desligada: "As inscrições abrem em breve.",
    pagamento_desligado: "O pagamento on-line abre em breve. Sua inscrição fica guardada, e avisaremos por e-mail.",
    credenciais_invalidas: "E-mail ou senha não conferem.",
    assinatura_inativa: "Não encontramos uma assinatura ativa nesta conta. Se você acabou de pagar, aguarde a liberação por e-mail.",
    estado_invalido: "Esta inscrição não pode receber pagamento agora. Fale com a equipe.",
    reembolso_indisponivel: "Não encontramos pagamento para reembolsar com estes dados.",
    turnstile_invalido: "Não foi possível confirmar a verificação de segurança. Tente de novo.",
    muitas_requisicoes: "Muitas tentativas em pouco tempo: aguarde alguns minutos.",
    dados_invalidos: "Confira os campos e tente de novo.",
    nao_encontrado: "Não encontramos uma inscrição com este protocolo e este e-mail.",
    token_invalido: "Seu acesso terminou. Entre de novo para continuar.",
    senha_fraca: "A senha precisa ter pelo menos 10 caracteres, sem espaço no começo nem no fim.",
    link_vencido: "O link venceu ou já foi usado. Peça um link novo: ele chega no seu e-mail em alguns minutos.",
    // Bitácora e relatórios do painel (27/11).
    limite_de_relatorios: "Você já gerou os 2 relatórios deste mês. No mês que vem, entram mais 2.",
    sem_registros: "Não há registros da bitácora neste período. Escolha outro período ou registre alguns dias antes.",
    bitacora_indisponivel: "A bitácora não está disponível nesta conta agora.",
    indisponivel: "O serviço está indisponível agora. Tente de novo daqui a pouco.",
    rede: "Não foi possível falar com o servidor. Confira a internet e tente de novo."
  };
  // Dita no lugar do "Enviando" quando a verificação de segurança passa do tempo de aviso.
  var DEMORA_NA_VERIFICACAO = "A verificação de segurança está demorando. Aguarde mais um pouco.";

  function frase(codigo) {
    return Object.prototype.hasOwnProperty.call(ERROS, codigo) ? ERROS[codigo] : ERROS.indisponivel;
  }

  function apiLigada() {
    return /^https:\/\/[a-z0-9.-]+$/.test(CONFIG.api);
  }

  // Pedido à API: devolve {ok, status, json} e nunca lança. Sem API configurada, {ok: false, erro: "desligada"}.
  function pedir(metodo, caminho, corpo, token) {
    if (!apiLigada()) return Promise.resolve({ ok: false, status: 0, json: { erro: "desligada" } });
    var cabecalhos = {};
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    if (token) cabecalhos.Authorization = "Bearer " + token;
    var controle = typeof AbortController === "function" ? new AbortController() : null;
    var relogio = controle ? setTimeout(function () { controle.abort(); }, CONFIG.espera_ms) : null;
    return fetch(CONFIG.api + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controle ? controle.signal : undefined,
      credentials: "omit",
      cache: "no-store"
    }).then(function (resposta) {
      return resposta.text().then(function (texto) {
        var json = null;
        try { json = JSON.parse(texto); } catch (e) { json = null; }
        return { ok: resposta.ok && Boolean(json) && json.ok === true, status: resposta.status, json: json || {} };
      });
    }, function () {
      return { ok: false, status: 0, json: { erro: "rede" } };
    }).then(function (resultado) {
      if (relogio) clearTimeout(relogio);
      return resultado;
    });
  }

  // Saúde do servidor com o motivo da falha: "rede" (sem internet ou sem resposta), "desligada" (página sem servidor)
  // ou "indisponivel". Com o motivo, a página não diz "em breve" quando o problema é a internet.
  function consultarSaude() {
    return pedir("GET", "/api/saude").then(function (r) {
      if (r.ok) return { saude: r.json, erro: null };
      return { saude: null, erro: r.json.erro === "rede" || r.json.erro === "desligada" ? r.json.erro : "indisponivel" };
    });
  }
  function saude() {
    return consultarSaude().then(function (r) { return r.saude; });
  }

  function dinheiro(centavos) {
    if (typeof centavos !== "number" || !isFinite(centavos)) return "";
    var reais = Math.floor(centavos / 100);
    var resto = String(Math.abs(centavos % 100));
    return "R$ " + String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + (resto.length < 2 ? "0" + resto : resto);
  }

  function data(iso) {
    var ms = Date.parse(iso);
    if (!isFinite(ms)) return "";
    var d = new Date(ms - 3 * 60 * 60 * 1000);
    var dois = function (n) { return n < 10 ? "0" + n : String(n); };
    return dois(d.getUTCDate()) + "/" + dois(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
  }

  // Contador das perguntas escritas (27/11), o mesmo no painel e em Minha conta. A semana vai da sexta às 00h01 até a
  // quinta. Nos planos pagos (uso.acumula), a cada dia entram mais uso.por_dia, e o que sobra passa para o dia
  // seguinte; na quinta, a próxima liberação já é a renovação (proxima_liberacao_em igual a renova_em). No gratuito, o
  // limite é o da semana. `restantes` (opcional) é o da última resposta da conversa; sem ele, vale o de `uso`.
  function textoDoUso(uso, restantes) {
    var resto = typeof restantes === "number" ? restantes
      : uso && typeof uso.restantes === "number" ? uso.restantes
        : uso && typeof uso.limite === "number" && typeof uso.usadas === "number" ? Math.max(0, uso.limite - uso.usadas) : null;
    if (typeof resto !== "number" || !isFinite(resto)) return "";
    var dia = uso && uso.renova_em ? data(uso.renova_em).slice(0, 5) : "";
    var renovacao = "na sexta-feira" + (dia ? ", " + dia : "") + ", às 00h01";
    if (uso && uso.acumula === true) {
      var frases = [resto === 1 ? "Resta 1 pergunta escrita." : "Restam " + resto + " perguntas escritas."];
      var naQuinta = !uso.proxima_liberacao_em || !uso.renova_em || Date.parse(uso.proxima_liberacao_em) === Date.parse(uso.renova_em);
      if (!naQuinta && typeof uso.por_dia === "number") frases.push("Amanhã, às 00h01, entram mais " + uso.por_dia + ".");
      frases.push("A semana renova " + renovacao + ".");
      return frases.join(" ");
    }
    var total = uso && typeof uso.limite === "number" ? " de " + uso.limite : "";
    // Resposta do servidor de antes (janela do dia), enquanto a página nova e o servidor novo não estão os dois no ar.
    if (uso && uso.janela === "dia") return (resto === 1 ? "Resta 1" : "Restam " + resto) + total + " hoje.";
    return (resto === 1 ? "Resta 1" : "Restam " + resto) + total + " nesta semana. Elas renovam " + renovacao + ".";
  }

  function no(etiqueta, classe, texto) {
    var elemento = document.createElement(etiqueta);
    if (classe) elemento.className = classe;
    if (texto !== undefined && texto !== null) elemento.textContent = texto;
    return elemento;
  }

  function anunciar(status, texto, tipo) {
    status.textContent = texto || "";
    status.className = "status" + (tipo ? " aviso aviso--" + tipo : "");
  }

  // Turnstile: carrega o widget só quando a página precisa, numa caixa da própria página.
  var promessaDoTurnstile = null;
  var scriptDoTurnstile = null;
  // O script que não chegou sai da página, e a tentativa seguinte começa do zero.
  function desistirDoScript() {
    promessaDoTurnstile = null;
    if (scriptDoTurnstile && scriptDoTurnstile.parentNode) scriptDoTurnstile.parentNode.removeChild(scriptDoTurnstile);
    scriptDoTurnstile = null;
  }
  function carregarTurnstile() {
    if (!CONFIG.turnstile_sitekey) return Promise.reject(new Error("turnstile"));
    if (raiz.turnstile) return Promise.resolve(raiz.turnstile);
    if (promessaDoTurnstile) return promessaDoTurnstile;
    promessaDoTurnstile = new Promise(function (resolver, recusar) {
      var script = document.createElement("script");
      scriptDoTurnstile = script;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = function () {
        if (raiz.turnstile) return resolver(raiz.turnstile);
        desistirDoScript();
        recusar(new Error("turnstile"));
      };
      script.onerror = function () { desistirDoScript(); recusar(new Error("turnstile")); };
      document.head.appendChild(script);
    });
    return promessaDoTurnstile;
  }
  // Uma ficha nova a cada envio (ela só vale uma vez). Correção de 24/11 (conferência do Carlos): apagar a caixa à mão
  // deixava o widget anterior vivo dentro do Turnstile ("Cannot find Widget", erro 600010) e a ficha nova nunca
  // chegava, com a página parada. Agora o widget anterior sai pelo próprio turnstile.remove, e a espera tem prazo.
  // O prazo conta desde o pedido: cobre também o script que não chega. Com `status` (o parágrafo de estado do
  // formulário), a página avisa quando a verificação passa do tempo de aviso, em vez de parecer parada.
  var widgetsPorCaixa = typeof WeakMap === "function" ? new WeakMap() : null;
  function fichaDoTurnstile(caixa, status) {
    return new Promise(function (resolver, recusar) {
      var terminou = false;
      var relogio = setTimeout(function () {
        if (!raiz.turnstile) desistirDoScript();
        acabar(recusar, new Error("turnstile_tempo"));
      }, CONFIG.espera_turnstile_ms);
      var aviso = status ? setTimeout(function () { if (!terminou) anunciar(status, DEMORA_NA_VERIFICACAO, ""); }, CONFIG.aviso_turnstile_ms) : null;
      function acabar(funcao, valor) {
        if (terminou) return;
        terminou = true;
        clearTimeout(relogio);
        if (aviso !== null) clearTimeout(aviso);
        funcao(valor);
      }
      carregarTurnstile().then(function (turnstile) {
        if (terminou) return;
        var anterior = widgetsPorCaixa ? widgetsPorCaixa.get(caixa) : null;
        if (anterior !== null && anterior !== undefined) {
          try { turnstile.remove(anterior); } catch (e) { /* já tinha saído */ }
        }
        try {
          var id = turnstile.render(caixa, {
            sitekey: CONFIG.turnstile_sitekey,
            callback: function (ficha) { acabar(resolver, ficha); },
            "error-callback": function () { acabar(recusar, new Error("turnstile")); return true; },
            "expired-callback": function () { acabar(recusar, new Error("turnstile")); },
            "timeout-callback": function () { acabar(recusar, new Error("turnstile_tempo")); }
          });
          if (widgetsPorCaixa && id !== undefined && id !== null) widgetsPorCaixa.set(caixa, id);
        } catch (e) {
          acabar(recusar, new Error("turnstile"));
        }
      }, function (erro) { acabar(recusar, erro); });
    });
  }

  // Token da assinante: só nesta aba (sessionStorage), nunca no armazenamento que fica depois de fechar.
  var CHAVE_DO_TOKEN = "endoafetos.assinante";
  function guardarToken(dados) {
    try { raiz.sessionStorage.setItem(CHAVE_DO_TOKEN, JSON.stringify({ token: dados.token, expira_em: dados.expira_em, plano: dados.plano })); } catch (e) { /* sem armazenamento */ }
  }
  // Plano da última entrada ("gratuito", "admin", "essencial" ou "completo"), só para o texto do contador da conversa.
  function planoGuardado() {
    try {
      var lido = JSON.parse(raiz.sessionStorage.getItem(CHAVE_DO_TOKEN) || "null");
      return lido && typeof lido.plano === "string" ? lido.plano : "";
    } catch (e) {
      return "";
    }
  }
  function tokenGuardado() {
    try {
      var lido = JSON.parse(raiz.sessionStorage.getItem(CHAVE_DO_TOKEN) || "null");
      if (!lido || typeof lido.token !== "string") return null;
      if (isFinite(Date.parse(lido.expira_em)) && Date.parse(lido.expira_em) <= Date.now()) return null;
      return lido.token;
    } catch (e) {
      return null;
    }
  }
  function esquecerToken() {
    try { raiz.sessionStorage.removeItem(CHAVE_DO_TOKEN); } catch (e) { /* sem armazenamento */ }
  }

  function parametro(nome) {
    var achado = new RegExp("[?&]" + nome + "=([^&#]*)").exec(raiz.location.search);
    return achado ? decodeURIComponent(achado[1].replace(/\+/g, " ")) : "";
  }

  // Páginas públicas da jornada (planos, inscrição, pagamento e termos), com a conta aberta nesta aba (27/11, pedido
  // do Carlos de não sair do app para o site por acaso): o "voltar" do topo leva ao painel, e a marca deixa de levar ao
  // site. O caminho até o painel vem do próprio topo (data-painel, gravado pelo gerador das páginas). As páginas de
  // dentro da conta têm a barra do painel e não têm "voltar": nelas nada muda.
  function voltarAoPainel(documento) {
    if (!documento || typeof documento.querySelector !== "function" || !tokenGuardado()) return false;
    var ligacoes = documento.querySelector(".topo__ligacoes[data-painel]");
    var voltar = documento.querySelector(".topo__voltar");
    if (!ligacoes || !voltar) return false;
    var painel = ligacoes.getAttribute("data-painel");
    if (typeof painel !== "string" || !/^(?:\.\.\/)+conta\/conversa\/$/.test(painel)) return false;
    voltar.setAttribute("href", painel);
    while (voltar.firstChild) voltar.removeChild(voltar.firstChild);
    var seta = documento.createElement("span");
    seta.setAttribute("aria-hidden", "true");
    seta.textContent = "‹ ";
    voltar.appendChild(seta);
    voltar.appendChild(documento.createTextNode("Voltar ao painel"));
    var marca = documento.querySelector("a.topo__marca");
    if (marca) marca.removeAttribute("href");
    // As outras ligações para o site, marcadas com data-site (o "Fale com a equipe"), viram texto: com a conta aberta,
    // a pessoa não sai do app por acaso.
    var doSite = typeof documento.querySelectorAll === "function" ? documento.querySelectorAll("a[data-site]") : [];
    for (var i = 0; i < doSite.length; i += 1) doSite[i].removeAttribute("href");
    return true;
  }
  if (typeof document !== "undefined") voltarAoPainel(document);

  raiz.EndoConta = {
    CONFIG: CONFIG, ERROS: ERROS, frase: frase, apiLigada: apiLigada, pedir: pedir, saude: saude, consultarSaude: consultarSaude,
    dinheiro: dinheiro, data: data, textoDoUso: textoDoUso,
    no: no, anunciar: anunciar, fichaDoTurnstile: fichaDoTurnstile, guardarToken: guardarToken, tokenGuardado: tokenGuardado,
    planoGuardado: planoGuardado, esquecerToken: esquecerToken, parametro: parametro, voltarAoPainel: voltarAoPainel
  };
})(typeof window !== "undefined" ? window : globalThis);
