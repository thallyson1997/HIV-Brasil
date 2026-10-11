# Deploy na Vercel

O painel é estático e usa `vercel.json` para publicar somente `VISUAIS/`. A raiz do domínio redireciona para `TEMPLATES/index.html`; não há build de frontend, dependências npm nem variáveis de ambiente.

## Atualizar os dados públicos

O CSV original em `DADOS/` permanece ignorado pelo Git e não é publicado. Para gerar o agregado público a partir da base local:

```powershell
.\.venv\Scripts\python.exe .\scripts\build_public_data.py
```

Se o ambiente virtual ainda não estiver criado, instale Python e execute `python scripts/build_public_data.py`.

O script grava `VISUAIS/DADOS_PUBLICOS/casos_agregados.json`. Ele inclui totais por ano, município e mês e perfil estadual por ano; contagens municipais e subcontagens abaixo de 10 são omitidas. Revise o agregado antes de adicioná-lo ao repositório, pois esse arquivo será público.

## Publicar

1. Envie ao Git as alterações e o arquivo agregado gerado.
2. Importe o repositório na Vercel com a raiz do projeto como **Root Directory**.
3. Deixe **Framework Preset** como `Other`; `vercel.json` configura o diretório de saída `VISUAIS`.
4. Faça o deploy. O endereço raiz abrirá o painel automaticamente.

Ao atualizar a base, gere e revise novamente o arquivo agregado antes do próximo deploy. Não remova `DADOS` do `.gitignore` nem envie o CSV bruto.