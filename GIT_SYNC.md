# ForgeMVP - Git & GitHub Synchronization Guide

This project has been initialized with Git. Follow these instructions to link this project to GitHub and synchronize your work.

---

## Step 1: Create a GitHub Repository

**Already done** - the repository lives at <https://github.com/nixies78/ForgeMVP>.
(Steps kept for reference if you ever start a fresh one):
1. Open [GitHub: Create a New Repository](https://github.com/new?name=ForgeMVP).
2. Set repository name to: `ForgeMVP`
3. Choose **Private** or **Public**.
4. **Important**: Leave "Initialize this repository with a README" **UNCHECKED** (initial files are already generated).
5. Click **Create repository**.

---

## Step 2: Link This Folder to GitHub

**Already done** - this repository is linked to <https://github.com/nixies78/ForgeMVP> and
`main` tracks `origin/main`. Just run `git push` (or `sync.bat`) to publish changes.

If you ever need to re-link (or clone onto another machine), the commands are:

```bash
git remote add origin https://github.com/nixies78/ForgeMVP.git
git branch -M main
git push -u origin main
```

---

## Step 3: Easily Sync Future Changes

### Method 1: Using `sync.bat` (1-Click Sync)
Double-click `sync.bat` in this folder anytime you want to save & push your progress.
- It stages all modified and new files.
- Asks for a commit message (or press Enter for auto-timestamp).
- Commits and pushes to GitHub in one action.

### Method 2: Manual Terminal Commands
```bash
git add -A
git commit -m "Describe your changes"
git push
```

---

## Helpful Git Commands
- Check modified files: `git status`
- View commit history: `git log --oneline`
- Pull updates from GitHub: `git pull`

---

## Living web page (Google Cloud)

`Dockerfile` and `cloudbuild.yaml` are ready so a push to `main` can build and deploy the
app to Cloud Run automatically. The one-time setup commands are at the top of
`cloudbuild.yaml`. Until that trigger exists, `npm start` serves the site locally on
<http://localhost:8080/> (and prints a LAN URL other people on your network can open).
