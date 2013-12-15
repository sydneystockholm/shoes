NPM=./node_modules/.bin

test: dependencies
	@$(NPM)/_mocha --reporter $(if $(or $(TEST),$(V)),spec,dot) \
		--slow 600 --timeout 2000 \
		--grep '$(TEST)'

lint: dependencies
	@$(NPM)/jshint --config .jshintrc lib test/*.js

dependencies:
	@if [ ! -d node_modules ]; then \
		echo -n "Installing dependencies.."; \
		npm install --silent >/dev/null; \
		echo "done."; \
	fi

coverage: dependencies
	@$(NPM)/istanbul cover $(NPM)/_mocha -- --reporter spec

coverage-html: coverage
	@if [ -f coverage/lcov-report/index.html ]; then \
		open coverage/lcov-report/index.html; \
	fi;

clean:
	@rm -rf coverage compiled/*

distclean: clean
	@rm -rf node_modules

check: test
deps: dependencies

.PHONY: dependencies clean
