// Assistente do Gastos Família Lira.
// Recebe uma frase e/ou a foto de um cupom, pergunta ao Gemini o que fazer
// e grava ou consulta o Supabase COM O LOGIN DA PRÓPRIA PESSOA,
// para que a proteção por linha continue valendo.
// A chave do Gemini é lida só do cofre da Netlify (CHAVE_GEMINI).
// Nenhuma chave secreta fica escrita neste arquivo.

// Copiados de app/configuracao.js (a chave pública pode aparecer)
const SUPABASE_URL = "https://iaegrquywhatvwbnzzub.supabase.co";
const SUPABASE_CHAVE_PUBLICA = "sb_publishable__3OKhdFCYXJ2P2pnpkp1Rg_GK-6fhzR";

const MODELO = "gemini-3.5-flash-lite";
const CATEGORIAS_PADRAO = [
  "Alimentação",
  "Educação",
  "Lazer",
  "Construção casa nova",
  "Contas da casa",
  "Outros"
];

export const config = { path: "/api/assistente" };

// ---------- Respostas ----------
function responder(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function erro(status, frase) {
  return responder(status, { erro: frase });
}

// Erro com uma frase em português pronta para mostrar
class ErroAssistente extends Error {
  constructor(status, frase) {
    super(frase);
    this.status = status;
  }
}

// ---------- Datas e dinheiro ----------
function hojeEmSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function diaDaSemanaEmSaoPaulo() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(new Date());
}

function dataValida(texto) {
  return typeof texto === "string" && /^\d{4}-\d{2}-\d{2}$/.test(texto) && !isNaN(Date.parse(texto));
}

function dataBr(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function dinheiro(n) {
  return formatoReal.format(n);
}

// ---------- Supabase, sempre com o token da pessoa ----------
function cabecalhosSupabase(token, extras = {}) {
  return {
    apikey: SUPABASE_CHAVE_PUBLICA,
    Authorization: `Bearer ${token}`,
    ...extras
  };
}

async function erroDoSupabase(resposta) {
  let detalhe = {};
  try { detalhe = await resposta.json(); } catch { /* corpo vazio */ }
  const texto = `${detalhe.code || ""} ${detalhe.message || ""}`.toLowerCase();

  if (resposta.status === 401 || texto.includes("jwt"))
    return new ErroAssistente(401, "Sua sessão venceu. Toque em Sair, entre de novo e tente outra vez.");
  if (texto.includes("42p01") || texto.includes("pgrst205") || texto.includes("does not exist") || texto.includes("could not find the table"))
    return new ErroAssistente(500, "A tabela gastos não foi encontrada no Supabase. Confira se ela foi criada.");
  if (texto.includes("row-level security") || resposta.status === 403)
    return new ErroAssistente(403, "O banco não deixou gravar este gasto. Toque em Sair, entre de novo e tente outra vez.");
  return new ErroAssistente(502, "O banco de dados não respondeu como esperado. Tente de novo em instantes.");
}

async function usuarioDoToken(token) {
  let resposta;
  try {
    resposta = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: cabecalhosSupabase(token) });
  } catch {
    throw new ErroAssistente(502, "Não consegui falar com o banco de dados. Tente de novo em instantes.");
  }
  if (!resposta.ok)
    throw new ErroAssistente(401, "Sua sessão venceu. Toque em Sair, entre de novo e tente outra vez.");
  const usuario = await resposta.json();
  if (!usuario || !usuario.id)
    throw new ErroAssistente(401, "Sua sessão venceu. Toque em Sair, entre de novo e tente outra vez.");
  return usuario;
}

async function gravarGasto(token, gasto) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/gastos`, {
    method: "POST",
    headers: cabecalhosSupabase(token, {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }),
    body: JSON.stringify(gasto)
  });
  if (!resposta.ok) throw await erroDoSupabase(resposta);
  const linhas = await resposta.json();
  return linhas[0] || gasto;
}

async function somarGastos(token, desde, ate, categoria) {
  const filtros = new URLSearchParams();
  filtros.set("select", "valor");
  filtros.append("data", `gte.${desde}`);
  filtros.append("data", `lte.${ate}`);
  if (categoria) filtros.set("categoria", `eq.${categoria}`);

  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/gastos?${filtros}`, {
    headers: cabecalhosSupabase(token)
  });
  if (!resposta.ok) throw await erroDoSupabase(resposta);
  const linhas = await resposta.json();

  // A soma é feita aqui, com os valores do banco, nunca pelo modelo
  const centavos = linhas.reduce((soma, l) => soma + Math.round(Number(l.valor || 0) * 100), 0);
  return { total: centavos / 100, quantidade: linhas.length };
}

// ---------- Gemini ----------
const FERRAMENTAS = [
  {
    function_declarations: [
      {
        name: "registrar_gasto",
        description: "Lança um gasto da pessoa. Use quando ela contar um gasto ou mandar a foto de um cupom fiscal.",
        parameters: {
          type: "object",
          properties: {
            data: { type: "string", description: "Data do gasto no formato AAAA-MM-DD." },
            descricao: { type: "string", description: "Onde ou com o quê. No cupom, o nome da loja." },
            valor: { type: "number", description: "Valor em reais, positivo. No cupom, o VALOR TOTAL." },
            categoria: { type: "string", description: "Uma das categorias da lista, escrita exatamente igual." }
          },
          required: ["data", "descricao", "valor", "categoria"]
        }
      },
      {
        name: "consultar_gastos",
        description: "Consulta quanto a pessoa gastou num período, opcionalmente numa categoria.",
        parameters: {
          type: "object",
          properties: {
            desde: { type: "string", description: "Primeiro dia do período, AAAA-MM-DD." },
            ate: { type: "string", description: "Último dia do período, AAAA-MM-DD." },
            categoria: { type: "string", description: "Opcional. Uma das categorias da lista, escrita exatamente igual." }
          },
          required: ["desde", "ate"]
        }
      }
    ]
  }
];

function promptDoSistema(categorias) {
  return [
    "Você é o assistente do app de gastos pessoais Gastos Família Lira. Responda sempre em português do Brasil, em frases curtas e simples.",
    `Hoje é ${diaDaSemanaEmSaoPaulo()}, ${hojeEmSaoPaulo()} (horário de São Paulo). Use essa data para entender "hoje", "ontem", "este mês" e parecidos.`,
    `As categorias são: ${categorias.join(", ")}. Use sempre uma delas, escrita exatamente igual. Se nenhuma servir, use Outros.`,
    "Quando a pessoa contar um gasto, chame registrar_gasto. Se não disser a data, use hoje.",
    "Quando vier a foto de um cupom fiscal, chame registrar_gasto com o VALOR TOTAL do cupom (não um item), a data de emissão do cupom e o nome da loja como descrição.",
    "Quando a pessoa perguntar quanto gastou, chame consultar_gastos com o período certo. Nunca calcule nem invente valores: o app faz a soma.",
    "Se faltar o valor ou a foto estiver ilegível, não chame ferramenta: peça a informação que falta numa frase.",
    "Nunca peça salário, renda, dívidas, nome do banco, número de conta, cartão ou senha."
  ].join("\n");
}

async function perguntarAoGemini(chave, categorias, mensagem, imagem, mime) {
  const partes = [];
  if (mensagem) partes.push({ text: mensagem });
  if (imagem) {
    if (!mensagem) partes.push({ text: "Lance o gasto deste cupom fiscal." });
    partes.push({ inline_data: { mime_type: mime || "image/jpeg", data: imagem } });
  }

  let resposta;
  try {
    resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: promptDoSistema(categorias) }] },
          contents: [{ role: "user", parts: partes }],
          tools: FERRAMENTAS,
          tool_config: { function_calling_config: { mode: "AUTO" } },
          generationConfig: { temperature: 0 }
        })
      }
    );
  } catch {
    throw new ErroAssistente(502, "Não consegui falar com o assistente. Tente de novo em instantes.");
  }

  if (resposta.status === 429)
    throw new ErroAssistente(429, "O limite de uso do assistente foi atingido. Espere alguns minutos e tente de novo, ou lance o gasto à mão.");
  if (resposta.status === 400 || resposta.status === 401 || resposta.status === 403) {
    let detalhe = "";
    try { detalhe = JSON.stringify(await resposta.json()).toLowerCase(); } catch { /* corpo vazio */ }
    if (detalhe.includes("api key") || detalhe.includes("api_key") || resposta.status !== 400)
      throw new ErroAssistente(500, "A chave do assistente não foi aceita. Confira a CHAVE_GEMINI no painel da Netlify.");
    throw new ErroAssistente(400, "O assistente não entendeu o pedido. Tente escrever de outro jeito ou mande uma foto mais nítida.");
  }
  if (!resposta.ok)
    throw new ErroAssistente(502, "O assistente está fora do ar agora. Tente de novo em instantes ou lance o gasto à mão.");

  const dados = await resposta.json();
  const partesResposta = dados?.candidates?.[0]?.content?.parts || [];
  const chamada = partesResposta.find((p) => p.functionCall || p.function_call);
  if (chamada) {
    const fc = chamada.functionCall || chamada.function_call;
    return { ferramenta: fc.name, argumentos: fc.args || {} };
  }
  const texto = partesResposta.map((p) => p.text || "").join("").trim();
  return { texto: texto || "Não entendi. Conte o gasto assim: mercado 50 hoje." };
}

// ---------- Função principal ----------
export default async (req) => {
  if (req.method !== "POST") return erro(405, "Use o app para falar com o assistente.");

  const chave = process.env.CHAVE_GEMINI;
  if (!chave)
    return erro(500, "O assistente ainda não tem a chave do Gemini. Cadastre CHAVE_GEMINI no painel da Netlify e publique de novo.");

  const cabecalho = req.headers.get("authorization") || "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";
  if (!token) return erro(401, "Você precisa entrar no app antes de usar o assistente.");

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "O pedido chegou incompleto. Tente de novo.");
  }

  const mensagem = typeof corpo.mensagem === "string" ? corpo.mensagem.trim().slice(0, 500) : "";
  const imagem = typeof corpo.imagem === "string" && corpo.imagem ? corpo.imagem : null;
  const mime = typeof corpo.mime === "string" && corpo.mime.startsWith("image/") ? corpo.mime : "image/jpeg";
  const categorias = Array.isArray(corpo.categorias) && corpo.categorias.length
    ? corpo.categorias.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim()).slice(0, 12)
    : CATEGORIAS_PADRAO;
  if (!categorias.includes("Outros")) categorias.push("Outros");

  if (!mensagem && !imagem) return erro(400, "Escreva o gasto ou mande a foto do cupom.");
  if (imagem && imagem.length > 5_000_000)
    return erro(413, "A foto ficou grande demais. Tente de novo com uma foto mais próxima do cupom.");

  try {
    const usuario = await usuarioDoToken(token);
    const decisao = await perguntarAoGemini(chave, categorias, mensagem, imagem, mime);

    if (decisao.ferramenta === "registrar_gasto") {
      const a = decisao.argumentos;
      const valor = Math.round(Number(a.valor) * 100) / 100;
      if (!(valor > 0))
        return responder(200, { resposta: "Não consegui ver o valor. Qual foi o valor do gasto?", lancado: false });

      const gasto = {
        dono: usuario.id,
        data: dataValida(a.data) ? a.data : hojeEmSaoPaulo(),
        descricao: String(a.descricao || "").trim().slice(0, 120) || null,
        valor,
        categoria: categorias.includes(a.categoria) ? a.categoria : "Outros",
        origem: imagem ? "foto" : "texto"
      };
      const salvo = await gravarGasto(token, gasto);
      const descricao = salvo.descricao || gasto.descricao || "sem descrição";
      return responder(200, {
        resposta: `Lancei ${dinheiro(Number(salvo.valor))} em ${salvo.categoria}: ${descricao}, ${dataBr(salvo.data)}.`,
        lancado: true
      });
    }

    if (decisao.ferramenta === "consultar_gastos") {
      const a = decisao.argumentos;
      const hoje = hojeEmSaoPaulo();
      const desde = dataValida(a.desde) ? a.desde : `${hoje.slice(0, 8)}01`;
      const ate = dataValida(a.ate) ? a.ate : hoje;
      const categoria = categorias.includes(a.categoria) ? a.categoria : null;

      const { total, quantidade } = await somarGastos(token, desde, ate, categoria);
      const onde = categoria ? ` em ${categoria}` : "";
      const periodo = desde === ate ? `em ${dataBr(desde)}` : `de ${dataBr(desde)} a ${dataBr(ate)}`;
      const vezes = quantidade === 1 ? "1 gasto" : `${quantidade} gastos`;
      return responder(200, {
        resposta: `Você gastou ${dinheiro(total)}${onde} ${periodo} (${vezes}).`,
        lancado: false
      });
    }

    return responder(200, { resposta: decisao.texto, lancado: false });
  } catch (e) {
    if (e instanceof ErroAssistente) return erro(e.status, e.message);
    return erro(500, "Algo deu errado no assistente. Tente de novo ou lance o gasto à mão.");
  }
};
