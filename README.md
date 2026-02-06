Hospital Management Software for SMNH

This software is being developed for Dr. A.H.Shivabasavaswamy to manage his OPD patients.

Remove-Item -Recurse -Force .next

Remove-Item -Recurse -Force .git
git status
git init
git add .
git commit -m "Initial commit for new GitHub repo"
git remote add origin https://github.com/anakalitha/performance_ratios.git
git branch -M main
git push -u origin main

Get-ChildItem -Recurse | Where-Object { $\_.FullName -notmatch ".next|node_modules|.git|bin|.vscode" } | Select-Object -ExpandProperty FullName > structure.txt
