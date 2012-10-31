REPORTER?=progress
ifdef V
	REPORTER=spec
endif

ifdef TEST
	T=--grep '${TEST}'
	REPORTER=list
endif

dependencies:
	npm install -s -d

deps: dependencies

test:
	@mkdir -p ./test/tmp
	@DISABLE_LOGGING=1 ./node_modules/mocha/bin/mocha \
	    --ignore-leaks \
		--reporter ${REPORTER} \
		-s 200 \
		-t 2000 $T
	@rm -rf ./test/tmp

check: test

.PHONY: test
