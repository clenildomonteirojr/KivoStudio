# Kivo Studio

## Executar localmente

É necessário ter Python 3 instalado. Execute `iniciar-kivo.bat` ou rode:

```text
python server.py
```

Depois abra http://localhost:8000. O arquivo `kivo.sqlite3` será criado automaticamente na primeira execução.

As contas ficam na tabela `users` e as tarefas na tabela `tasks`, sempre relacionadas ao usuário autenticado.
