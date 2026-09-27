# Native Antigravity Integration: Generative Engine Optimization (GEO) & AI-First SEO

This document provides a comprehensive architectural guide to the native integration of the [geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude) capability into the Google Antigravity environment.

---

## 1. Executive Summary & Design Philosophy

The upstream project was originally built as a Claude Code custom skill utilizing Claude-specific paradigms:
- Hardcoded slash command conventions (`/geo:audit`, `/geo:citability`, etc.).
- POSIX-only shebang paths (`#!/usr/bin/env python3` or hardcoded `~/.claude/skills/geo/.venv/bin/python3`).
- Shell installers (`install.sh`, `install-win.sh`) that injected dependencies into user-global directories.
- Reliance on Claude-specific agent tools (`WebFetch`, `Bash`, `Read`, `Write`).

Rather than blindly running upstream installer scripts or polluting system Python environments, this integration transforms the repository into a **first-class, native Antigravity capability** following these key architectural principles:
1. **Full Fidelity to Upstream Methodology**: Preserves all 6 audit dimensions, composite scoring formulas (0-100), passage citability algorithms, schema definitions, and report generation templates.
2. **Native Progressive Disclosure**: Implemented as standard Antigravity skill packages (`SKILL.md` with standard YAML frontmatter) enabling the model to automatically activate the skill on relevant natural-language prompts.
3. **Hermetic Virtual Environment Isolation**: Bundles an isolated virtual environment (`.venv`) with all required Python libraries, preventing pollution of the user's host Python environment.
4. **Universal Cross-Platform Runner**: Dispatches all tasks via `scripts/geo_runner.py`, dynamically detecting the host OS (Windows, Linux, macOS) and ensuring commands run with the isolated virtual environment interpreter automatically.
5. **Dual-Discovery Topology**: Installed both at the project workspace level (`.agents/skills/geo-seo/`) and globally in Antigravity's configuration (`~/.gemini/config/skills/geo-seo/`).

---

## 2. Directory Structure & Layout

The skill is laid out in strict accordance with Antigravity conventions:

```
.agents/skills/geo-seo/
├── SKILL.md                          # Primary Antigravity skill entry point & triggers
├── requirements.txt                  # Python dependencies
├── LICENSE                           # Upstream MIT License
├── .venv/                            # Isolated virtual environment (Python 3.10+)
├── scripts/
│   ├── geo_runner.py                 # Universal Antigravity CLI runner & venv supervisor
│   ├── fetch_page.py                 # Page fetching, headers, SSR/CSR, sitemaps, robots.txt
│   ├── citability_scorer.py          # Passage-level 5-dimension citability scoring (0-100)
│   ├── brand_scanner.py              # Brand entity & Wikidata cross-correlation scanner
│   ├── llmstxt_generator.py          # llms.txt validation and generation
│   ├── crm_dashboard.py              # Prospects CRM CLI tool
│   └── webapp/                       # Local Flask CRM web application
│       ├── app.py
│       └── templates/
├── agents/                           # Specialist subagent definitions
│   ├── geo-ai-visibility.md          # AI bot access, llms.txt, citability, brand entities
│   ├── geo-technical.md              # SSR/CSR, response codes, Core Web Vitals, indexability
│   ├── geo-content.md                # E-E-A-T, factual density, formatting structure
│   ├── geo-schema.md                 # JSON-LD detection, validation, generation
│   └── geo-platform-analysis.md      # Platform optimization (ChatGPT, Perplexity, AIO, Gemini)
├── schema/                           # Production-ready JSON-LD schemas
│   ├── article-author.json
│   ├── local-business.json
│   ├── organization.json
│   ├── product-ecommerce.json
│   ├── software-saas.json
│   └── website-searchaction.json
├── templates/                        # Report generation templates
│   ├── geo-report-template.html      # Responsive HTML client audit report template
│   └── geo-report-style.css          # Print/PDF & screen stylesheet
├── tests/                            # Automated test suite (pytest)
│   └── test_fetch_page_ssr.py
├── references/                       # Upstream architecture & methodology documentation
│   ├── architecture.md
│   ├── commands-reference.md
│   ├── scoring-methodology.md
│   ├── skills-and-agents.md
│   └── sub-skills/                   # Detailed references for all 15 sub-capabilities
└── examples/                         # Real-world audit samples, proposals, and CRM demos
```

---

## 3. Replaced Claude-Specific Components

| Claude Code Upstream | Antigravity Native Replacement | Rationale |
|---|---|---|
| Slash Commands (`/geo:audit`, `/geo:citability`) | Natural Language Workflows defined in `SKILL.md` | Antigravity activates skills based on intent and semantic matching. |
| Hardcoded path `~/.claude/skills/geo/...` | Relative paths resolved from `scripts/geo_runner.py` | Eliminates hardcoded home directory dependencies and works cross-platform. |
| Unix Shebangs (`#!/usr/bin/env python3`) | `geo_runner.py` with automatic venv re-exec | Allows direct execution on Windows PowerShell and Command Prompt without POSIX emulation. |
| `WebFetch` tool | `read_url_content` / `geo_runner.py fetch` | Antigravity native URL reading and Python HTTP client with full header capture. |
| `Bash` tool | `run_command` (PowerShell / sh) | Native Antigravity command execution. |
| Claude subagents (`Agent` runner) | Native Subagent definitions (`invoke_subagent` / `agents/*.md`) | Antigravity subagents can execute independently with clear tool boundaries. |
| Global install in `~/.claude/skills/` | Dual location: Workspace `.agents/skills/` & Global `~/.gemini/config/skills/` | Provides immediate local workspace usage and persistent multi-project availability. |

---

## 4. Universal Python Runner (`geo_runner.py`)

The runner acts as the single operational nexus for all GEO/SEO tasks. It provides:
1. **Interpreter Supervision**: Checks if the calling Python interpreter is the dedicated `.venv`. If invoked via system Python (`python scripts/geo_runner.py ...`), it silently re-spawns itself using `.venv/Scripts/python.exe` (Windows) or `.venv/bin/python` (macOS/Linux).
2. **Command Dispatch**: Exposes clean subcommands for all GEO operations:
   - `fetch <url> [page|robots|llms|sitemap|blocks|full]`
   - `citability <url>`
   - `brands "<brand>" [domain]`
   - `llmstxt <url> [validate|generate]`
   - `crm [args...]`
   - `webapp [--port 5050]`
   - `test`

---

## 5. Core Capabilities & Workflows

### 5.1 Full GEO + SEO Audit
- **Telemetry**: Measures 6 core dimensions: AI Visibility (25%), Technical SEO (20%), Content Quality & E-E-A-T (20%), Structured Data (15%), Platform Optimization (10%), Brand Entity Authority (10%).
- **Composite GEO Score**: Outputs a weighted 0–100 score with diagnostic tier classification.
- **Action Plan**: Formulates P0 (Critical), P1 (Important), and P2 (Strategic) remediation priorities.

### 5.2 60-Second Quick Audit
- Fetches target page HTML, response headers, `robots.txt`, and `llms.txt`.
- Tests for SSR vs CSR (verifying content isn't trapped in unrendered client bundles).
- Verifies crawler permissions for top AI bots (GPTBot, ClaudeBot, PerplexityBot).
- Returns immediate diagnostic highlights and top 3 quick wins.

### 5.3 Passage Citability Analysis
- Parses content into semantic passages.
- Evaluates 5 dimensions: Self-containment, Factual density, Quotability, Authority signals, and Formatting.
- Identifies weak passages and provides high-citability rewrites.

### 5.4 AI Crawler & Robots.txt Audit
- Checks for explicit permissions or disallows across the modern AI crawler registry.
- Provides optimized robots.txt snippets balancing AI discovery with content protection.

### 5.5 llms.txt Generation & Validation
- Validates syntax and structure of existing `/llms.txt` files.
- Generates clean, markdown-formatted `/llms.txt` files directly from sitemap crawls.

### 5.6 Brand Mentions & Entity Authority
- Performs direct queries against the Wikidata SPARQL/Entity APIs.
- Assesses presence and sentiment across AI-cited platforms (Wikipedia, YouTube, Reddit, LinkedIn).

---

## 6. Verification & Automated Testing

The integration includes an automated test suite verifying server-side rendering detection, client-side rendering edge cases, and parser robustness:

```powershell
python .agents\skills\geo-seo\scripts\geo_runner.py test
```

### Test Suite Results:
- `test_plain_html_has_ssr_content_true`: PASSED
- `test_plain_html_has_no_csr_error`: PASSED
- `test_wordpress_bricks_not_flagged`: PASSED
- `test_wordpress_bricks_no_csr_error`: PASSED
- `test_litespeed_cache_not_flagged`: PASSED
- `test_litespeed_cache_no_csr_error`: PASSED
- `test_prerender_service_not_flagged`: PASSED
- `test_prerender_service_no_csr_error`: PASSED
- `test_empty_app_div_flagged`: PASSED
- `test_empty_app_div_has_error`: PASSED
- `test_loading_root_div_flagged`: PASSED
- `test_loading_root_div_has_error`: PASSED
- `test_csr_error_includes_word_count`: PASSED
- `test_root_with_nested_scripts_and_rich_text_not_flagged`: PASSED
**Result**: 14 passed in 0.48s.

---

## 7. Upstream Maintenance & Sync Guide

To update the skill when the upstream repository releases new features:
1. Fetch latest changes from `https://github.com/zubair-trabzada/geo-seo-claude` into a scratch staging directory.
2. Update python scripts in `.agents/skills/geo-seo/scripts/` (preserving `geo_runner.py`).
3. Check `requirements.txt` for new packages and install them into `.agents/skills/geo-seo/.venv/`.
4. Update schemas in `schema/` and templates in `templates/`.
5. Run the verification test suite: `python .agents\skills\geo-seo\scripts\geo_runner.py test`.
6. Sync changes to the global directory: `C:\Users\A\.gemini\config\skills\geo-seo\`.
