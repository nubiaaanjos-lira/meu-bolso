# Meu Bolso — memória do projeto

Este arquivo é a memória deste projeto. O Claude lê este arquivo sempre que esta pasta é aberta e segue o que está escrito aqui.

---

## 1. O que é este projeto

O **Meu Bolso** é um app de gastos pessoais, feito durante a Formação Claude Pro.

- **Quem usa:** só eu, no celular e no computador.
- **O que ele faz:** registra meus gastos e mostra o total do mês, separado por categoria.
- **O que vem na sexta:** um assistente que lança o gasto a partir de uma frase (por exemplo, "gastei 32 reais no mercado") ou da foto do cupom fiscal.
- **Telas e categorias:** ainda não estão definidas. Elas vão sair de uma entrevista que o Claude vai conduzir comigo.

---

## 2. Regras técnicas que não se discutem

- **Onde ficam os arquivos do app:** todos dentro da pasta `app/`:
  - `index.html` (a página)
  - `estilo.css` (a aparência)
  - `app.js` (o funcionamento)
  - `configuracao.js` (os dados de conexão)
  - `manifest.webmanifest` (para instalar no celular como app)
  - `icone.svg` (o ícone)
- **Sem ferramentas extras:** sem Node, sem etapa de "build", sem framework. São arquivos simples que o navegador abre direto.
- **Conexão com o Supabase (o banco de dados):** entra por esta linha, e só por ela:
  `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>`
- **Entrada no app:** por e-mail e senha, sem e-mail de confirmação.
- **Tabelas:** `gastos` e `resumos`, as duas com proteção por linha (cada pessoa só enxerga o que é dela).
- **Endereço do projeto e chave pública:** ficam em `app/configuracao.js`, dentro de `window.MEU_BOLSO`.
- **Chaves que nunca entram em arquivo nenhum:** a chave secreta do Supabase e a chave do Gemini.
- **Na raiz da pasta:**
  - `netlify.toml` publica a pasta `app`.
  - `.gitignore` deixa de fora `.env`, `.netlify` e `node_modules`.
- **Celular primeiro:** o app é pensado primeiro para uma tela de celular de 390 px de largura; o computador vem depois.
- **Mensagens de erro:** todo erro aparece como uma frase em português que diz o que fazer.

---

## 3. O que este app nunca faz

- Nunca pede, guarda ou mostra senha de banco, número de conta ou número de cartão.
- Nunca guarda a foto do cupom (ela é usada para ler o gasto e depois descartada).
- Nunca envia e-mail ou mensagem.
- Nunca usa dados de outra pessoa.

---

## 4. Como trabalhar comigo

- **Plano antes de mexer:** antes de alterar qualquer arquivo, mostre o plano em até dez linhas e espere a minha aprovação.
- **Uma mudança por vez:** faça uma alteração de cada vez e mostre o que mudou (antes e depois).
- **Entrega em arquivo:** todo resultado vai para um arquivo; na conversa, mostre só os caminhos dos arquivos.
- **Linguagem:** fale em português, para quem não programa. Evite termos técnicos e, quando não der, explique em uma frase.
