param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$requiredDocs = @(
    "agents.md",
    "skills.md",
    "rules.md",
    "mainidea.md",
    ".codex/config.toml",
    ".codex/rules/default.rules"
)

$requiredSkills = @(
    "idea-intake",
    "scene-decomposition",
    "pascal-node-mapping",
    "execution-planning",
    "ide-orchestration",
    "scene-validation",
    "export-readiness"
)

$errors = New-Object System.Collections.Generic.List[string]

function Add-Error {
    param([string]$Message)
    $errors.Add($Message)
}

function Test-RequiredFile {
    param([string]$RelativePath)
    $fullPath = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        Add-Error "Missing required file: $RelativePath"
    }
}

foreach ($doc in $requiredDocs) {
    Test-RequiredFile $doc
}

$configPath = Join-Path $Root ".codex/config.toml"
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    $config = Get-Content -Raw $configPath
    if ($config -notmatch 'project_doc_fallback_filenames\s*=\s*\["agents\.md"\]') {
        Add-Error "Config does not declare agents.md as a fallback project instruction filename."
    }
}

$skillRoot = Join-Path $Root ".agents/skills"
if (-not (Test-Path -LiteralPath $skillRoot -PathType Container)) {
    Add-Error "Missing skills directory: .agents/skills"
}

foreach ($skill in $requiredSkills) {
    $skillDir = Join-Path $skillRoot $skill
    $skillFile = Join-Path $skillDir "SKILL.md"

    if (-not (Test-Path -LiteralPath $skillDir -PathType Container)) {
        Add-Error "Missing skill directory: .agents/skills/$skill"
        continue
    }

    if (-not (Test-Path -LiteralPath $skillFile -PathType Leaf)) {
        Add-Error "Missing skill manifest: .agents/skills/$skill/SKILL.md"
        continue
    }

    $content = Get-Content -Raw $skillFile
    $match = [regex]::Match($content, '(?ms)^---\r?\n(.*?)\r?\n---\r?\n?(.*)$')
    if (-not $match.Success) {
        Add-Error "Invalid frontmatter block in .agents/skills/$skill/SKILL.md"
        continue
    }

    $frontmatter = $match.Groups[1].Value
    $body = $match.Groups[2].Value.Trim()

    $nameMatch = [regex]::Match($frontmatter, '(?m)^name:\s*(.+?)\s*$')
    $descriptionMatch = [regex]::Match($frontmatter, '(?m)^description:\s*(.+?)\s*$')

    if (-not $nameMatch.Success) {
        Add-Error "Missing name field in .agents/skills/$skill/SKILL.md"
    } else {
        $name = $nameMatch.Groups[1].Value.Trim().Trim('"').Trim("'")
        if ($name -ne $skill) {
            Add-Error "Skill name '$name' does not match directory '$skill'"
        }
        if ($name -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
            Add-Error "Skill name '$name' is not valid hyphen-case."
        }
    }

    if (-not $descriptionMatch.Success) {
        Add-Error "Missing description field in .agents/skills/$skill/SKILL.md"
    } else {
        $description = $descriptionMatch.Groups[1].Value.Trim()
        if ([string]::IsNullOrWhiteSpace($description)) {
            Add-Error "Empty description field in .agents/skills/$skill/SKILL.md"
        }
    }

    if ([string]::IsNullOrWhiteSpace($body)) {
        Add-Error "Empty skill body in .agents/skills/$skill/SKILL.md"
    }
}

$ideSetup = Join-Path $Root "scripts/ide-setup.mjs"
if (Test-Path -LiteralPath $ideSetup -PathType Leaf) {
    & node $ideSetup --check
    if ($LASTEXITCODE -ne 0) {
        Add-Error "node scripts/ide-setup.mjs --check failed."
    }
} else {
    Add-Error "Missing scripts/ide-setup.mjs"
}

if ($errors.Count -gt 0) {
    Write-Host "Pistola foundation validation failed:" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host " - $error" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Pistola foundation validation passed." -ForegroundColor Green
