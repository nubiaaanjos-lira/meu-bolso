// Gastos Família Lira — funcionamento do app.
// Usa só o cliente do Supabase (carregado pela CDN no index.html)
// e os dados de window.MEU_BOLSO (em configuracao.js).

(function () {
  "use strict";

  var config = window.MEU_BOLSO || {};
  var CATEGORIAS = config.CATEGORIAS || ["Outros"];

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

    // Lista do mês
    var lista = $("lista-gastos");
    lista.textContent = "";
    $("lista-vazia").hidden = gastos.length > 0;

    gastos.forEach(function (g) {
      var item = document.createElement("li");

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

      item.appendChild(info);
      item.appendChild(valor);
      item.appendChild(apagar);
      lista.appendChild(item);
    });

    // Barras por categoria
    var barras = $("barras");
    barras.textContent = "";
    Object.keys(porCategoria).forEach(function (cat) {
      var valorCat = porCategoria[cat];
      var porcento = total > 0 ? Math.round((valorCat / total) * 100) : 0;

      var item = document.createElement("li");
      var texto = document.createElement("div");
      texto.className = "barra-texto";
      var nome = document.createElement("span");
      nome.textContent = cat;
      var quanto = document.createElement("strong");
      quanto.textContent = dinheiro(valorCat);
      texto.appendChild(nome);
      texto.appendChild(quanto);

      var fundo = document.createElement("div");
      fundo.className = "barra-fundo";
      var cheia = document.createElement("div");
      cheia.className = "barra-cheia";
      cheia.style.width = porcento + "%";
      fundo.appendChild(cheia);

      item.appendChild(texto);
      item.appendChild(fundo);
      barras.appendChild(item);
    });
  }

  function desenharBotoesCategoria() {
    var caixa = $("botoes-categoria");
    caixa.textContent = "";
    CATEGORIAS.forEach(function (cat) {
      var botao = document.createElement("button");
      botao.type = "button";
      botao.className = "categoria";
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

  // ---------- Assistente (chega na sexta) ----------
  function avisoAssistente() {
    mostrarAviso($("aviso-assistente"), "O assistente chega na sexta.", true);
  }

  $("form-assistente").addEventListener("submit", function (e) {
    e.preventDefault();
    avisoAssistente();
  });
  $("botao-foto").addEventListener("click", avisoAssistente);

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
