# GPS Finder - developer shortcuts.
#
# `make serve` needs nothing but Python. The verification targets need Node
# (see docs/REQUIREMENTS.md); `make verify` is the gate used in CI.

PYTHON ?= python3
PORT   ?= 8000

.PHONY: help serve verify check test smoke data fixtures vendor install-skill clean

help:
	@echo "make serve          serve the web app at http://localhost:$(PORT)/"
	@echo "make verify        run every check (static, unit, DOM smoke, vendor, data)"
	@echo "make check         static checks on index.html"
	@echo "make test          unit tests against reference values"
	@echo "make smoke         load the real page in jsdom and drive it"
	@echo "make data          regenerate the lookup tables embedded in index.html"
	@echo "make fixtures      regenerate the JPEG test fixtures (needs pillow + piexif)"
	@echo "make vendor        refresh vendor/geo-sleuth/MANIFEST.sha256"
	@echo "make install-skill install the vendored skill into your agents"
	@echo "make clean         remove test and Python caches"

serve:
	@echo "http://localhost:$(PORT)/  (Ctrl+C to stop)"
	@$(PYTHON) -m http.server $(PORT) --bind 0.0.0.0

check:
	@node tools/check-page.mjs

test:
	@node --test tests/app.test.mjs

smoke:
	@node tools/dom-smoke.mjs

data:
	@$(PYTHON) tools/build-data-tables.py

fixtures:
	@$(PYTHON) tools/make-test-fixtures.py

vendor:
	@$(PYTHON) tools/verify-vendor.py --write
	@$(PYTHON) tools/verify-vendor.py

install-skill:
	@./install.sh

verify: check test smoke
	@$(PYTHON) tools/verify-vendor.py
	@$(PYTHON) tools/build-data-tables.py --check
	@echo "all checks passed"

clean:
	@rm -rf node_modules/.cache .pytest_cache __pycache__ tools/__pycache__ tests/__pycache__
	@find . -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
	@echo "caches removed (node_modules kept: run 'rm -rf node_modules' to drop it)"
