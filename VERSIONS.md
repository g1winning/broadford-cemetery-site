# Versions

## 22 October 2026: before the cemetery records

The cemetery records work replaced Broadford's Chronicle map and back office. The state of everything just before it is kept so either repository can go back in one step.

The tag `before-cemetery-records-2026-10-22` marks it on GitHub in both repositories:

| Repository | Commit before | What it held |
|---|---|---|
| g1winning/ideas-union-cms | 62c24f6 "Content editor: proof of concept" | The content editor with no cemetery records |
| g1winning/broadford-cemetery-poc | 013f0d9 "Editing guide for the trustees" | The site with Chronicle's map embedded on the grave search page |

The editor's database is not in git. Two copies sit in `cms/prisma/backups/` on this computer: `dev-before-cemetery-records-2026-10-22.db` (users, sites, drafts, no cemetery tables) and `dev-with-cemetery-records-2026-10-22.db` (the same plus the imported records). Photos imported from Chronicle sit in `cms/storage/`, the pulled copy of Chronicle in `cms/data/chronicle/`.

## Going back

To put a repository back as it was, revert the work as a new commit, which keeps the history:

```bash
git revert --no-edit before-cemetery-records-2026-10-22..main
```

Run it inside the repository folder, then `git push`. For the site, the grave search page returns to the Chronicle embed and the next deploy publishes it. The `cemetery-photos` branch, once created by a publish, can stay or be deleted with `git push origin --delete cemetery-photos`.

To put the editor's database back, stop the editor, then copy the earlier file over the live one:

```bash
cp prisma/backups/dev-before-cemetery-records-2026-10-22.db prisma/dev.db
```

Run it inside `cms/`. Reverting the code without restoring the database also works: the extra tables are ignored by the earlier code.

To look at the earlier state without changing anything, `git checkout before-cemetery-records-2026-10-22` in either repository, then `git checkout main` to return.
