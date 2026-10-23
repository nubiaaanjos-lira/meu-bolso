// Gastos Família Lira — funcionamento do app.
// Usa só o cliente do Supabase (carregado pela CDN no index.html)
// e os dados de window.MEU_BOLSO (em configuracao.js).

(function () {
  "use strict";

  var config = window.MEU_BOLSO || {};
  var CATEGORIAS = config.CATEGORIAS || ["Outros"];

  // Uma cor neon para cada categoria
  var CORES = {
    "Alimentação": "#39ff88",
    "Educação": "#22d3ff",
    "Lazer": "#ff3ec9",
    "Construção casa nova": "#ff8a1f",
    "Contas da casa": "#ffe93b",
    "Outros": "#b45cff"
  };
  var CORES_RESERVA = ["#39ff88", "#22d3ff", "#ff3ec9", "#ff8a1f", "#ffe93b", "#b45cff"];

  function corDe(categoria) {
    if (CORES[categoria]) return CORES[categoria];
    var i = CATEGORIAS.indexOf(categoria);
    return CORES_RESERVA[(i < 0 ? CORES_RESERVA.length - 1 : i) % CORES_RESERVA.length];
  }

  var SVG = "http://www.w3.org/2000/svg";
  function elementoSvg(nome, atributos) {
    var el = document.createElementNS(SVG, nome);
    Object.keys(atributos).forEach(function (k) { el.setAttribute(k, atributos[k]); });
    return el;
  }

  // ---------- Atalhos para a tela ----------
  function $(id) { return document.getElementById(id); }

  var telaEntrada = $("tela-entrada");
  var telaPrincipal = $("tela-principal");

  // ---------- Ligação com o Supabase ----------
  if (!window.supabase || !config.SUPABASE_URL || !config.SUPABASE_CHAVE_PUBLICA) {
    mostrarAviso($("aviso-entrada"),
      "Não foi possível carregar o app. Confira sua internet e recarregue a página.");
    return;
  }

  var cliente = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_CHAVE_PUBLICA);
  var usuario = null;
  var categoriaEscolhida = null;

  // ---------- Formatação ----------
  var formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  function dinheiro(numero) { return formatoReal.format(numero || 0); }

  function doisDigitos(n) { return (n < 10 ? "0" : "") + n; }

  // Data no formato AAAA-MM-DD, no fuso do aparelho
  function dataIso(d) {
    return d.getFullYear() + "-" + doisDigitos(d.getMonth() + 1) + "-" + doisDigitos(d.getDate());
  }

  function hoje() { return dataIso(new Date()); }

  function dataCurta(iso) {
    var partes = String(iso).split("-");
    return partes.length === 3 ? partes[2] + "/" + partes[1] : iso;
  }

  // Aceita "12,50", "12.50" e "1.234,56"
  function lerValor(texto) {
    var t = String(texto || "").trim().replace(/[R$\s]/g, "");
    if (t.indexOf(",") !== -1) t = t.replace(/\./g, "").replace(",", ".");
    var numero = Number(t);
    return isFinite(numero) ? Math.round(numero * 100) / 100 : NaN;
  }

  // ---------- Avisos ----------
  function mostrarAviso(elemento, frase, sucesso) {
    elemento.textContent = frase;
    elemento.classList.toggle("sucesso", !!sucesso);
    elemento.hidden = false;
  }

  function esconderAviso(elemento) { elemento.hidden = true; }

  // Transforma o erro técnico numa frase em português que diz o que fazer
  function fraseDoErro(erro) {
    var msg = String((erro && (erro.message || erro.error_description)) || erro || "").toLowerCase();

    if (msg.indexOf("failed to fetch") !== -1 || msg.indexOf("network") !== -1)
      return "Sem conexão com a internet. Confira o Wi-Fi ou os dados móveis e tente de novo.";
    if (msg.indexOf("invalid login credentials") !== -1)
      return "E-mail ou senha incorretos. Confira e tente de novo, ou toque em Criar conta.";
    if (msg.indexOf("already registered") !== -1 || msg.indexOf("already been registered") !== -1)
      return "Já existe uma conta com este e-mail. Toque em Entrar.";
    if (msg.indexOf("password") !== -1 && msg.indexOf("at least") !== -1)
      return "A senha precisa ter pelo menos 6 caracteres. Escolha uma senha maior.";
    if (msg.indexOf("email not confirmed") !== -1)
      return "Seu e-mail ainda não foi confirmado. Desligue a opção \"Confirm email\" no painel do Supabase e tente de novo.";
    if (msg.indexOf("invalid") !== -1 && msg.indexOf("email") !== -1)
      return "Este e-mail não parece válido. Confira se está escrito certo.";
    if (msg.indexOf("rate limit") !== -1 || msg.indexOf("too many") !== -1)
      return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    if (msg.indexOf("row-level security") !== -1 || msg.indexOf("permission") !== -1 || msg.indexOf("jwt") !== -1)
      return "O app não tem permissão para isso agora. Toque em Sair, entre de novo e tente outra vez.";
    if (msg.indexOf("does not exist") !== -1 || msg.indexOf("could not find") !== -1)
      return "A tabela do banco não foi encontrada. Confira se as tabelas gastos e resumos foram criadas no Supabase.";

    return "Algo deu errado. Recarregue a página e tente de novo.";
  }

  // ---------- Troca de telas ----------
  function mostrarEntrada() {
    usuario = null;
    telaPrincipal.hidden = true;
    telaEntrada.hidden = false;
  }

  function mostrarPrincipal(user) {
    usuario = user;
    telaEntrada.hidden = true;
    telaPrincipal.hidden = false;
    $("data").value = hoje();
    carregarTudo();
  }

  // ---------- Entrar, criar conta e sair ----------
  function lerCredenciais() {
    var email = $("email").value.trim();
    var senha = $("senha").value;
    if (!email || !senha) {
      mostrarAviso($("aviso-entrada"), "Preencha o e-mail e a senha para continuar.");
      return null;
    }
    if (senha.length < 6) {
      mostrarAviso($("aviso-entrada"), "A senha precisa ter pelo menos 6 caracteres.");
      return null;
    }
    return { email: email, password: senha };
  }

  function travarEntrada(travar) {
    $("botao-entrar").disabled = travar;
    $("botao-criar").disabled = travar;
  }

  $("form-entrada").addEventListener("submit", async function (e) {
    e.preventDefault();
    esconderAviso($("aviso-entrada"));
    var cred = lerCredenciais();
    if (!cred) return;

    travarEntrada(true);
    try {
      var resposta = await cliente.auth.signInWithPassword(cred);
      if (resposta.error) throw resposta.error;
    } catch (erro) {
      mostrarAviso($("aviso-entrada"), fraseDoErro(erro));
    } finally {
      travarEntrada(false);
    }
  });

  $("botao-criar").addEventListener("click", async function () {
    esconderAviso($("aviso-entrada"));
    var cred = lerCredenciais();
    if (!cred) return;

    travarEntrada(true);
    try {
      var resposta = await cliente.auth.signUp(cred);
      if (resposta.error) throw resposta.error;
      if (!resposta.data.session) {
        mostrarAviso($("aviso-entrada"),
          "Conta criada, mas o Supabase está pedindo confirmação de e-mail. Desligue a opção \"Confirm email\" no painel do Supabase e toque em Entrar.");
      }
    } catch (erro) {
      mostrarAviso($("aviso-entrada"), fraseDoErro(erro));
    } finally {
      travarEntrada(false);
    }
  });

  $("botao-sair").addEventListener("click", async function () {
    await cliente.auth.signOut();
    $("senha").value = "";
  });

  // ---------- Carregar dados do mês ----------
  function inicioDoMes() {
    var d = new Date();
    return dataIso(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  function inicioDoProximoMes() {
    var d = new Date();
    return dataIso(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  async function carregarTudo() {
    esconderAviso($("aviso-geral"));
    await Promise.all([carregarGastos(), carregarResumo()]);
  }

  async function carregarGastos() {
    var resposta = await cliente
      .from("gastos")
      .select("id, data, descricao, valor, categoria, origem, criado_em")
      .gte("data", inicioDoMes())
      .lt("data", inicioDoProximoMes())
      .order("data", { ascending: false })
      .order("criado_em", { ascending: false });

    if (resposta.error) {
      mostrarAviso($("aviso-geral"), fraseDoErro(resposta.error));
      return;
    }
    desenharGastos(resposta.data || []);
  }

  async function carregarResumo() {
    var resposta = await cliente
      .from("resumos")
      .select("texto, criado_em")
      .order("criado_em", { ascending: false })
      .limit(1);

    var resumo = !resposta.error && resposta.data && resposta.data[0];
    if (resumo && resumo.texto) {
      $("texto-resumo").textContent = resumo.texto;
      $("cartao-resumo").hidden = false;
    } else {
      $("cartao-resumo").hidden = true;
    }
  }

  // ---------- Desenhar na tela ----------
  function desenharGastos(gastos) {
    var total = 0;
    var porCategoria = {};
    CATEGORIAS.forEach(function (c) { porCategoria[c] = 0; });

    gastos.forEach(function (g) {
      var valor = Number(g.valor) || 0;
      total += valor;
      var cat = porCategoria.hasOwnProperty(g.categoria) ? g.categoria : "Outros";
      porCategoria[cat] = (porCategoria[cat] || 0) + valor;
    });

    $("rotulo-mes").textContent = "Total de " + MESES[new Date().getMonth()];
    $("total-mes").textContent = dinheiro(total);
    // Média por dia: total do mês dividido pelo dia de hoje
    $("media-dia").textContent = "Média de " + dinheiro(total / new Date().getDate()) + " por dia";

    // Lista do mês
    var lista = $("lista-gastos");
    lista.textContent = "";
    $("lista-vazia").hidden = gastos.length > 0;

    gastos.forEach(function (g) {
      var item = document.createElement("li");

      var ponto = document.createElement("span");
      ponto.className = "ponto";
      ponto.style.setProperty("--cor", corDe(g.categoria));

      var info = document.createElement("div");
      info.className = "gasto-info";
      var descricao = document.createElement("p");
      descricao.className = "gasto-descricao";
      descricao.textContent = g.descricao || g.categoria;
      var detalhe = document.createElement("p");
      detalhe.className = "gasto-detalhe";
      detalhe.textContent = dataCurta(g.data) + " · " + g.categoria;
      info.appendChild(descricao);
      info.appendChild(detalhe);

      var valor = document.createElement("span");
      valor.className = "gasto-valor";
      valor.textContent = dinheiro(Number(g.valor));

      var apagar = document.createElement("button");
      apagar.type = "button";
      apagar.className = "botao-apagar";
      apagar.textContent = "Apagar";
      apagar.setAttribute("aria-label", "Apagar gasto de " + dinheiro(Number(g.valor)));
      apagar.addEventListener("click", function () { apagarGasto(g.id, apagar); });

      item.appendChild(ponto);
      item.appendChild(info);
      item.appendChild(valor);
      item.appendChild(apagar);
      lista.appendChild(item);
    });

    desenharRosca(porCategoria, total);
    desenharLinha(gastos);
  }

  // Gráfico de rosca: uma fatia por categoria, na cor neon dela
  function desenharRosca(porCategoria, total) {
    var svg = $("grafico-rosca");
    svg.textContent = "";
    $("rosca-total").textContent = dinheiro(total);

    var raio = 48;
    var volta = 2 * Math.PI * raio;
    svg.appendChild(elementoSvg("circle", {
      cx: 60, cy: 60, r: raio, fill: "none", stroke: "#1f1f30", "stroke-width": 14
    }));

    var andado = 0;
    var legenda = $("legenda");
    legenda.textContent = "";

    Object.keys(porCategoria).forEach(function (cat) {
      var valorCat = porCategoria[cat];
      var cor = corDe(cat);
      var parte = total > 0 ? valorCat / total : 0;

      if (parte > 0) {
        var tamanho = parte * volta;
        // Pequeno espaço entre as fatias, só quando há mais de uma
        var espaco = parte < 1 ? Math.min(2, tamanho / 2) : 0;
        svg.appendChild(elementoSvg("circle", {
          cx: 60, cy: 60, r: raio, fill: "none", stroke: cor, "stroke-width": 14,
          "stroke-dasharray": (tamanho - espaco) + " " + (volta - tamanho + espaco),
          "stroke-dashoffset": -andado,
          transform: "rotate(-90 60 60)",
          style: "filter: drop-shadow(0 0 4px " + cor + ")"
        }));
        andado += tamanho;
      }

      var item = document.createElement("li");
      var ponto = document.createElement("span");
      ponto.className = "ponto";
      ponto.style.setProperty("--cor", cor);
      var nome = document.createElement("span");
      nome.className = "legenda-nome";
      nome.textContent = cat;
      var valor = document.createElement("span");
      valor.className = "legenda-valor";
      valor.textContent = dinheiro(valorCat);
      var porcento = document.createElement("small");
      porcento.textContent = Math.round(parte * 100) + "%";
      valor.appendChild(porcento);

      item.appendChild(ponto);
      item.appendChild(nome);
      item.appendChild(valor);
      legenda.appendChild(item);
    });
  }

  // Gráfico de linha: quanto o gasto do mês foi subindo, dia a dia, até hoje
  function desenharLinha(gastos) {
    var svg = $("grafico-linha");
    svg.textContent = "";

    var agora = new Date();
    var diaHoje = agora.getDate();
    var diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();

    var porDia = [];
    for (var d = 0; d <= diasNoMes; d++) porDia.push(0);
    gastos.forEach(function (g) {
      var dia = Number(String(g.data).split("-")[2]);
      if (dia >= 1 && dia <= diasNoMes) porDia[dia] += Number(g.valor) || 0;
    });

    var acumulado = [];
    var soma = 0;
    for (var i = 1; i <= diaHoje; i++) { soma += porDia[i]; acumulado.push(soma); }

    var largura = 300, altura = 70, margem = 6;
    var maximo = soma > 0 ? soma : 1;
    var pontos = acumulado.map(function (v, idx) {
      var x = diasNoMes > 1 ? (idx / (diasNoMes - 1)) * largura : 0;
      var y = altura - margem - (v / maximo) * (altura - margem * 2);
      return [x, y];
    });
    if (pontos.length === 1) pontos.push([pontos[0][0] + 1, pontos[0][1]]);

    var defs = elementoSvg("defs", {});
    var degrade = elementoSvg("linearGradient", { id: "area-linha", x1: 0, y1: 0, x2: 0, y2: 1 });
    degrade.appendChild(elementoSvg("stop", { offset: 0, "stop-color": "#39ff88", "stop-opacity": 0.35 }));
    degrade.appendChild(elementoSvg("stop", { offset: 1, "stop-color": "#39ff88", "stop-opacity": 0 }));
    defs.appendChild(degrade);
    svg.appendChild(defs);

    var linha = pontos.map(function (p, idx) {
      return (idx ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
    }).join(" ");
    var ultimo = pontos[pontos.length - 1];

    svg.appendChild(elementoSvg("path", {
      d: linha + " L" + ultimo[0].toFixed(1) + " " + altura + " L0 " + altura + " Z",
      fill: "url(#area-linha)"
    }));
    svg.appendChild(elementoSvg("path", {
      d: linha, fill: "none", stroke: "#39ff88", "stroke-width": 2.5,
      "stroke-linejoin": "round", "stroke-linecap": "round",
      "vector-effect": "non-scaling-stroke",
      style: "filter: drop-shadow(0 0 4px #39ff88)"
    }));
  }

  function desenharBotoesCategoria() {
    var caixa = $("botoes-categoria");
    caixa.textContent = "";
    CATEGORIAS.forEach(function (cat) {
      var botao = document.createElement("button");
      botao.type = "button";
      botao.className = "categoria";
      botao.style.setProperty("--cor", corDe(cat));
      botao.textContent = cat;
      botao.setAttribute("role", "radio");
      botao.setAttribute("aria-checked", "false");
      botao.addEventListener("click", function () {
        categoriaEscolhida = cat;
        Array.prototype.forEach.call(caixa.children, function (b) {
          b.setAttribute("aria-checked", b === botao ? "true" : "false");
        });
      });
      caixa.appendChild(botao);
    });
  }

  function limparCategoria() {
    categoriaEscolhida = null;
    Array.prototype.forEach.call($("botoes-categoria").children, function (b) {
      b.setAttribute("aria-checked", "false");
    });
  }

  // ---------- Lançar à mão ----------
  $("form-gasto").addEventListener("submit", async function (e) {
    e.preventDefault();
    var aviso = $("aviso-gasto");
    esconderAviso(aviso);

    var valor = lerValor($("valor").value);
    var descricao = $("descricao").value.trim();
    var data = $("data").value || hoje();

    if (!(valor > 0)) {
      mostrarAviso(aviso, "Digite o valor do gasto, por exemplo 25,90.");
      $("valor").focus();
      return;
    }
    if (!categoriaEscolhida) {
      mostrarAviso(aviso, "Toque em uma categoria antes de salvar.");
      return;
    }

    var botao = $("botao-salvar");
    botao.disabled = true;
    try {
      var resposta = await cliente.from("gastos").insert({
        dono: usuario.id,
        data: data,
        descricao: descricao || null,
        valor: valor,
        categoria: categoriaEscolhida,
        origem: "manual"
      });
      if (resposta.error) throw resposta.error;

      $("valor").value = "";
      $("descricao").value = "";
      limparCategoria();
      mostrarAviso(aviso, "Gasto salvo.", true);
      await carregarGastos();
    } catch (erro) {
      mostrarAviso(aviso, fraseDoErro(erro));
    } finally {
      botao.disabled = false;
    }
  });

  // ---------- Apagar ----------
  async function apagarGasto(id, botao) {
    if (!window.confirm("Apagar este gasto?")) return;
    botao.disabled = true;
    var resposta = await cliente.from("gastos").delete().eq("id", id);
    if (resposta.error) {
      botao.disabled = false;
      mostrarAviso($("aviso-geral"), fraseDoErro(resposta.error));
      return;
    }
    await carregarGastos();
  }

  // ---------- Assistente ----------
  var LADO_MAXIMO_FOTO = 1600;

  function travarAssistente(travar) {
    $("botao-enviar").disabled = travar;
    $("botao-foto").disabled = travar;
  }

  // Reduz a foto no próprio aparelho: no máximo 1600 px, em JPEG.
  // A foto não é guardada em lugar nenhum.
  function reduzirFoto(arquivo) {
    return new Promise(function (resolve, reject) {
      var endereco = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () {
        var escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(endereco);
        var dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
      };
      img.onerror = function () {
        URL.revokeObjectURL(endereco);
        reject(new Error("foto"));
      };
      img.src = endereco;
    });
  }

  async function falarComAssistente(mensagem, imagem) {
    var aviso = $("aviso-assistente");
    mostrarAviso(aviso, imagem ? "Lendo o cupom..." : "Pensando...", true);
    travarAssistente(true);
    try {
      var sessao = (await cliente.auth.getSession()).data.session;
      if (!sessao) {
        mostrarAviso(aviso, "Sua sessão venceu. Toque em Sair e entre de novo.");
        return;
      }

      var resposta;
      try {
        resposta = await fetch("/api/assistente", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + sessao.access_token
          },
          body: JSON.stringify({
            mensagem: mensagem,
            imagem: imagem || null,
            mime: imagem ? "image/jpeg" : null,
            categorias: CATEGORIAS
          })
        });
      } catch (e) {
        mostrarAviso(aviso, "Sem conexão com a internet. Confira o Wi-Fi ou os dados móveis e tente de novo.");
        return;
      }

      var dados = null;
      try { dados = await resposta.json(); } catch (e) { dados = null; }

      if (!dados) {
        mostrarAviso(aviso, "O assistente só funciona com o app publicado na Netlify. Abra o endereço do app e tente de novo.");
        return;
      }
      if (!resposta.ok || dados.erro) {
        mostrarAviso(aviso, dados.erro || "O assistente não respondeu. Tente de novo ou lance o gasto à mão.");
        return;
      }

      mostrarAviso(aviso, dados.resposta, true);
      if (dados.lancado) {
        $("frase").value = "";
        await carregarGastos();
      }
    } finally {
      travarAssistente(false);
    }
  }

  $("form-assistente").addEventListener("submit", function (e) {
    e.preventDefault();
    var mensagem = $("frase").value.trim();
    if (!mensagem) {
      mostrarAviso($("aviso-assistente"), "Escreva o gasto ou a pergunta, por exemplo: mercado 50 hoje.");
      $("frase").focus();
      return;
    }
    falarComAssistente(mensagem, null);
  });

  $("botao-foto").addEventListener("click", function () {
    $("arquivo-foto").click();
  });

  $("arquivo-foto").addEventListener("change", async function () {
    var arquivo = this.files && this.files[0];
    this.value = "";
    if (!arquivo) return;

    var imagem;
    try {
      imagem = await reduzirFoto(arquivo);
    } catch (e) {
      mostrarAviso($("aviso-assistente"), "Não consegui abrir esta foto. Tire outra foto do cupom, em JPEG ou PNG, e tente de novo.");
      return;
    }
    falarComAssistente($("frase").value.trim(), imagem);
  });

  // ---------- Início ----------
  desenharBotoesCategoria();

  // O setTimeout evita que o Supabase trave ao buscar dados dentro deste aviso
  cliente.auth.onAuthStateChange(function (evento, sessao) {
    setTimeout(function () {
      if (sessao && sessao.user) {
        if (!usuario || usuario.id !== sessao.user.id) mostrarPrincipal(sessao.user);
      } else {
        mostrarEntrada();
      }
    }, 0);
  });
})();
