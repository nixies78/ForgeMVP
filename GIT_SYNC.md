# ForgeMVP - Git & GitHub Synchronization Guide

This project has been initialized with Git. Follow these instructions to link this project to GitHub and synchronize your work.

---

## Step 1: Create a GitHub Repository
1. Open [GitHub: Create a New Repository](https://github.com/new?name=ForgeMVP).
2. Set repository name to: `ForgeMVP`
3. Choose **Private** or **Public**.
4. **Important**: Leave "Initialize this repository with a README" **UNCHECKED** (initial files are already generated).
5. Click **Create repository**.

---

## Step 2: Link This Folder to GitHub
Run the following commands in this directory (`C:\VibeCoding\ForgeMVP`):

```bash
git remote add origin https://github.com/<YOUR-GITHUB-USERNAME>/ForgeMVP.git
git branch -M main
git push -u origin main
```
*(Replace `<YOUR-GITHUB-USERNAME>` with your GitHub username)*

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
