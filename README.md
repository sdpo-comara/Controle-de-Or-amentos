# Controle de Orçamentos

Sistema web para um grupo consultar, cadastrar e acompanhar orçamentos.
Quem tem o link **e a senha de consulta** consulta. Só quem tem a senha administrativa cadastra, corrige ou revisa.

## Como funciona

| Parte | O que usa |
|---|---|
| Interface | HTML, CSS e JavaScript puros (pasta raiz). Sem build, sem instalação. |
| Banco de dados online | PostgreSQL no Supabase (plano gratuito atende). |
| Senha administrativa | Conferida **dentro do banco**. Guardada só como hash (bcrypt). Não existe no HTML nem no JavaScript. |
| Proteção dos dados | Nenhuma tabela é acessível diretamente pela API. A leitura passa por uma função que exige a **senha de consulta**. Toda alteração passa por funções que exigem sessão administrativa. Triggers bloqueiam alteração e exclusão feitas por fora dessas funções. |
| Dados compartilhados | Todos leem o mesmo banco. A tela se atualiza sozinha a cada 30 segundos e ao voltar para a aba. |

Não há uso de `localStorage` para dados. O navegador guarda apenas o nome de quem registra (para não digitar de novo) e o token da sessão, que vale 8 horas.

## Testar sem instalar nada

Abra o arquivo `index.html` no navegador. Com o `config.js` em branco o sistema abre em **modo demonstração**, com dados de exemplo só na memória. A senha de teste é `demo1234`.

## Publicar (cerca de 10 minutos)

### 1. Criar o banco
1. Crie uma conta em https://supabase.com e um novo projeto (escolha a região mais próxima, por exemplo São Paulo). Anote a senha do banco em local seguro.
2. No projeto, abra **SQL Editor > New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.

### 1b. Instalar o Acompanhamento (aba de elaboração)
Ainda no **SQL Editor > New query**, cole o conteúdo de `supabase/acompanhamento.sql` e clique em **Run**. Rode **depois** do `schema.sql`. Pode ser executado de novo sem apagar dados. Sem este passo o sistema continua funcionando; só a aba Acompanhamento avisa que não foi instalada.

### 2. Definir a senha administrativa
Em uma nova consulta no SQL Editor, execute (troque o texto da senha):

```sql
insert into public.admin_config (id, senha_hash)
values (1, extensions.crypt('ESCOLHA-UMA-SENHA-FORTE', extensions.gen_salt('bf', 10)))
on conflict (id) do update set senha_hash = excluded.senha_hash, atualizado_em = now();
```

Depois de entrar no sistema, use **Administração > Alterar senha** para trocar por uma senha que nunca passou pelo SQL Editor (o editor guarda o histórico das consultas).

### 2b. Definir a senha de consulta
Ainda no SQL Editor, execute (troque o texto). Sem este passo ninguém consegue consultar:

```sql
update public.admin_config set consulta_hash = extensions.crypt('SENHA-DE-CONSULTA', extensions.gen_salt('bf', 10)) where id = 1;
```

Depois pode trocar em **Administração > Senha de consulta**. Entregue esta senha ao grupo junto com o link. Quem tiver o link sem a senha vê só a tela de entrada.

### 3. Ligar a interface ao banco
No Supabase, abra **Project Settings > API** (ou **API Keys**) e copie:
- **Project URL**
- a chave **anon** (ou **publishable**)

Cole no arquivo `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ..."
};
```

A chave anon é pública por desenho. Nunca use a chave `service_role` aqui.

### 4. Colocar no ar
Publique a pasta (`index.html`, `app.js`, `styles.css`, `config.js`). A pasta `supabase/` não precisa subir. Qualquer hospedagem de site estático serve:

- **Netlify:** acesse https://app.netlify.com/drop e arraste a pasta. O link sai na hora.
- **Cloudflare Pages:** *Create project > Direct Upload*, envie a pasta.
- **GitHub Pages:** envie os arquivos a um repositório e ative Pages em *Settings > Pages*. O site fica público, mas sem dados: eles só saem do banco com a senha de consulta. Confirme se a política da sua organização permite.
- **Vercel:** *Add New > Project* e envie a pasta.

Crie a conta antes de enviar: sites enviados sem conta (Drop anônimo) costumam ser apagados em cerca de 1 hora. Use um nome de site longo e difícil de adivinhar. O `index.html` já pede aos buscadores que não listem a página.

### 5. Compartilhar
Envie o link e a senha de consulta no grupo do WhatsApp (de preferência em mensagens separadas). Entregue a senha administrativa só a quem vai cadastrar.

## Uso

- **Painel inicial:** orçamentos cadastrados (originais e revisões, pois cada revisão é um orçamento), originais, revisões, versões vigentes e últimos registros.
- **Atenção hoje (Painel inicial):** lista as demandas com MQ ou orçamento vencido ou vencendo em até 3 dias, revisões/conferências com prazo vencendo e demandas sem prioridade. Aparece com o banco online e depende do `acompanhamento.sql`.
- **Consultar orçamentos:** pesquisa por nome do orçamento, número ou responsável; filtros por período de entrega, execução, regime e versão (vigentes, originais ou revisões).
- **Histórico de revisões:** cada orçamento com a sequência de versões, valores, variação e motivo. Em toda a lista, cada orçamento aparece como Original ou nª Revisão, e como Vigente ou Versão anterior.
- **Acompanhamento** (NPA 2/DE-SDPO/2023): quadro ou lista das demandas, da demanda recebida até a disponibilização. Quem tem a senha de consulta vê; só administradores alteram.
  - *Nova demanda:* escopo, origem, demandante, prioridade (começa "a definir" até o Coordenador classificar), nível, fim, execução, objeto, regime, Autor e Supervisor técnico. O produto é sugerido pelos campos e define as peças do checklist.
  - *MQs por disciplina e prazo do orçamento:* cada demanda tem uma lista de Memoriais de Quantidades (um por disciplina; nem toda demanda tem as mesmas), cada um com prazo previsto e data de recebimento. O prazo do orçamento é calculado: **último MQ recebido + dias úteis de elaboração + 5 de Revisão + 5 de Conferência**. Os dias de elaboração são informados em cada demanda, porque a NPA deixa esse prazo para os chefes da DE e da SDPO; a Revisão e a Conferência vêm da NPA. Enquanto faltar algum MQ, o prazo aparece como "previsto" (usa o prazo previsto dos pendentes); ao receber o último, passa a contar a partir dele. Mudar um MQ, os dias de elaboração ou os feriados recalcula o prazo.
  - *Fluxo:* Demanda recebida → Definição do produto → Elaboração → Revisão → Conferência → Aprovação → Disponibilizada. Avança uma etapa por vez; devolver exige motivo. Para sair da Definição é preciso ter prioridade, produto, Autor, Supervisor e os dois prazos. Na Elaboração marca-se o item da NPA em curso (2.5.1 a 2.5.10).
  - *Revisão e Conferência:* prazo de 5 dias úteis (3 se a etapa voltar), sem contar fins de semana e os feriados cadastrados. O checklist de peças (Anexo A da NPA) nasce na Revisão; peças "no que couber" podem ser marcadas como não se aplica, as demais não. Só segue para a Conferência com todas as peças tratadas.
  - *Disponibilizar:* exige escolher o orçamento já registrado no controle de versões. Uma atualização de relatório entregue é uma nova demanda ligada ao orçamento de origem.
  - *Quem fez:* cada ação pede "quem está registrando" (lista de responsáveis), e tudo fica na lista de movimentações da demanda.
  - *Feriados:* Administração > Feriados e pontos facultativos (inclui botão com os nacionais do ano; confira os facultativos e os feriados locais da sua unidade).
- **Tela de entrada:** pede a senha de consulta. A senha fica só na aba aberta; ao fechar a aba, é preciso informar de novo.
- **Cadastrar orçamento** e **Administração:** pedem a senha administrativa.
- **Backup (Administração):** exporta os orçamentos (inclusive arquivados) e o registro de alterações em CSV, que abre no Excel.
- **Responsáveis (Administração):** lista padrão de nomes. Os campos de responsável pelo orçamento, pelo cadastro e pela revisão são escolhidos nessa lista, e o banco recusa nomes fora dela. Antes do primeiro cadastro, adicione os nomes em Administração. Renomear ou desativar um nome não altera registros antigos.
- **Registrar revisão** (na tela de detalhes): cria um novo orçamento com número novo, ligado ao original. Ex.: 001 Original, 002 – 1ª Revisão do orçamento 001, 003 – 2ª Revisão do orçamento 001. O registro anterior nunca é alterado.
- **Corrigir dados:** só para erros de digitação. Fica gravado no registro de alterações com o antes e o depois.
- **Arquivar:** tira o orçamento da consulta pública, mas mantém no banco. Pode ser restaurado em Administração.
- **Excluir definitivamente:** só para itens arquivados, sem revisões vinculadas, pedindo a senha de novo e a digitação do número do orçamento. Um instantâneo do registro fica na auditoria.

## Segurança em resumo

- Senha só em hash bcrypt na tabela `admin_config`, sem acesso pela API pública.
- Login devolve um token aleatório de 8 horas (guardado como hash no banco). Cinco senhas erradas bloqueiam novas tentativas por 15 minutos.
- Row Level Security ligado em todas as tabelas, sem nenhuma policy de leitura: o papel público não lê nem escreve direto nas tabelas.
- A consulta é a função `consulta_dados`, que confere a senha de consulta (bcrypt). Dez senhas erradas em 15 minutos bloqueiam novas tentativas por 15 minutos. O bloqueio vale para todos, então alguém mal-intencionado pode atrasar a consulta, mas não lê dados.
- Quem sabe a senha de consulta lê tudo; não há controle por pessoa. Se a senha vazar, troque em Administração e avise o grupo.
- Triggers impedem `UPDATE` e `DELETE` fora das funções autorizadas e impedem mudar número, vínculo e dados de cadastro.
- A tabela de auditoria não aceita alteração nem exclusão.
- Data e hora de cadastro e de revisão são gravadas pelo servidor, não pelo navegador.
- Toda a comunicação usa HTTPS. A senha trafega apenas no login, na troca de senha e na exclusão definitiva.

## Pontos de atenção

- **Plano gratuito do Supabase:** o projeto é pausado após cerca de 7 dias sem uso. Basta reativar no painel. Acessar o sistema de vez em quando evita a pausa.
- **Backup:** o plano gratuito não tem backup automático. Use **Administração > Backup** (CSV) de tempos em tempos.
- **Atualizar o esquema:** `schema.sql` pode ser executado de novo sem apagar dados. Ao rodar esta versão num banco antigo, a leitura pública é removida; defina a senha de consulta (passo 2b) em seguida. Se você já tinha rodado uma versão com o campo de status, rodar de novo remove esse campo.
- **Acompanhamento:** a aba só existe com o banco online (e na demonstração). Os dias úteis são contados pelo servidor com o fuso de Brasília; as datas de prazo do MQ e do orçamento são alertas de calendário (dias corridos) e não bloqueiam nada.
- **Responsável pelo cadastro:** como a senha é compartilhada, quem registra escolhe o próprio nome na lista de responsáveis, e ele é gravado junto com o horário do servidor.

## Arquivos

```
index.html            página
styles.css            visual (claro e escuro automáticos)
app.js                lógica da interface e modo demonstração
config.js             URL e chave pública do Supabase
supabase/schema.sql          tabelas, RLS, triggers e funções
supabase/acompanhamento.sql  aba Acompanhamento (demandas, peças, feriados)
```
