<#
Install the vendored geo-sleuth Agent Skill into your coding agents (Windows).

  .\install.ps1                  install for your user (%USERPROFILE%\.agents\skills + a Claude Code link)
  .\install.ps1 -Target C:\path  install project-locally into C:\path\.agents\skills
  .\install.ps1 -DryRun          print the plan, change nothing
  .\install.ps1 -NoLink          skip the Claude Code link
  .\install.ps1 -Force           overwrite an existing installation
#>
[CmdletBinding()]
param(
  [string]$Target = $env:USERPROFILE,
  [switch]$NoLink,
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceSkill = Join-Path $sourceRoot 'skills\geo-sleuth'
$agentsDir = Join-Path $Target '.agents\skills'
$claudeDir = Join-Path $Target '.claude\skills'
$dest = Join-Path $agentsDir 'geo-sleuth'
$link = Join-Path $claudeDir 'geo-sleuth'

function Say  { param([string]$m) Write-Host $m }
function Step { param([string]$m) Write-Host "  $m" }

if (-not (Test-Path (Join-Path $sourceSkill 'SKILL.md'))) {
  Write-Error 'skills/geo-sleuth/SKILL.md is missing: run this script from a full clone of the repository.'
  exit 1
}

Say 'Installing geo-sleuth'
Step "source:  $sourceSkill"
Step "agents:  $dest   (Codex, Cursor, Gemini CLI, OpenCode, GitHub Copilot)"
if (-not $NoLink) { Step "claude:  $link" }
if ($DryRun) { Say '(dry run: nothing will be written)' }

if ((Test-Path $dest) -and -not $Force) {
  Say ''
  Say "$dest already exists. Re-run with -Force to replace it, or remove it yourself."
  exit 1
}

Say ''
Say 'Dependencies'
$missing = @()
foreach ($cmd in @('python', 'uv', 'curl')) {
  $found = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($found) { Step "found $($found.Source)" } else { Step "MISSING: $cmd"; $missing += $cmd }
}
$browser = Get-Command 'chrome' -ErrorAction SilentlyContinue
if (-not $browser) {
  $browser = Get-ChildItem 'C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($browser) { Step 'found a Chrome installation' } else { Step 'no Chrome found: reverse image search will need uvx playwright install chromium' }
if ($missing.Count -gt 0) {
  Say ''
  Say 'Install the missing commands before using the skill:'
  Say '  python   https://www.python.org/downloads/'
  Say '  uv       https://docs.astral.sh/uv/'
  Say '  curl     ships with Windows 10 and later'
  Say 'The web app (index.html) needs none of them.'
}

Say ''
Say 'Files'
if ($DryRun) {
  Step "would create $agentsDir"
  if ($Force) { Step "would remove $dest" }
  Step "would copy $sourceSkill -> $dest"
  if (-not $NoLink) { Step "would link $link -> $dest" }
} else {
  New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null
  if ($Force -and (Test-Path $dest)) { Remove-Item -Recurse -Force $dest }
  Copy-Item -Recurse -Force $sourceSkill $dest
  Step "copied to $dest"
  if (-not $NoLink) {
    New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null
    if (Test-Path $link) { Remove-Item -Recurse -Force $link }
    try {
      New-Item -ItemType SymbolicLink -Path $link -Target $dest | Out-Null
      Step "linked $link -> $dest"
    } catch {
      Step "could not create a symlink (enable Developer Mode or run as administrator); copying instead"
      Copy-Item -Recurse -Force $dest $link
      Step "copied to $link"
    }
  }
}

Say ''
Say 'Next'
Step "1. uv run `"$dest\scripts\doctor.py`" --network"
Step '2. Ask your agent: "find where this photo was taken" with a photo attached'
Step "Docs: $sourceRoot\docs\INSTALL.md and $sourceRoot\docs\USAGE.md"
Step "Web app (no install needed): open $sourceRoot\index.html"
Say ''
Say 'Done.'
