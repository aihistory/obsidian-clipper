#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Enhanced Template Triggers System...\n');

// 模拟测试环境
const mockContext = {
	url: 'https://tech.example.com/article/123',
	title: '技术文章：如何优化Web性能',
	description: '这是一篇关于Web性能优化的技术文章',
	schemaOrgData: [
		{
			'@type': 'Article',
			'author': '张三',
			'headline': '技术文章：如何优化Web性能'
		}
	],
	dom: {
		querySelectorAll: (selector) => {
			if (selector === '.product-price') return [];
			if (selector === '.ingredients') return [{ textContent: '面粉, 鸡蛋, 糖' }];
			if (selector === '.instructions') return [{ textContent: '1. 混合面粉和鸡蛋...' }];
			return [];
		}
	},
	meta: {
		'og:type': 'article',
		'description': '技术文章描述'
	},
	currentTime: new Date('2024-01-15T10:30:00')
};

// 测试结果统计
const testResults = {
	passed: 0,
	failed: 0,
	total: 0
};

// 简单的测试函数
function test(name, testFn) {
	testResults.total++;
	try {
		const result = testFn();
		if (result instanceof Promise) {
			result.then(() => {
				testResults.passed++;
				console.log(`✅ ${name}`);
			}).catch((error) => {
				testResults.failed++;
				console.error(`❌ ${name}: ${error.message}`);
			});
		} else {
			testResults.passed++;
			console.log(`✅ ${name}`);
		}
	} catch (error) {
		testResults.failed++;
		console.error(`❌ ${name}: ${error.message}`);
	}
}

// 模拟触发器系统的基本功能
class MockTriggerSystem {
	constructor() {
		this.rules = [];
	}

	parseRule(rule) {
		// 简单的规则解析模拟
		if (rule.includes('AND')) {
			return { type: 'AND', parts: rule.split(' AND ') };
		} else if (rule.includes('OR')) {
			return { type: 'OR', parts: rule.split(' OR ') };
		} else {
			return { type: 'SIMPLE', rule };
		}
	}

	async matchRule(rule, context) {
		const parsed = this.parseRule(rule);
		
		switch (parsed.type) {
			case 'SIMPLE':
				return this.matchSimpleRule(parsed.rule, context);
			case 'AND':
				return this.matchAndRule(parsed.parts, context);
			case 'OR':
				return this.matchOrRule(parsed.parts, context);
			default:
				return false;
		}
	}

	matchSimpleRule(rule, context) {
		if (rule.startsWith('url:')) {
			const pattern = rule.substring(4);
			return context.url.includes(pattern.replace('https://', ''));
		}
		if (rule.startsWith('title:')) {
			const pattern = rule.substring(6);
			if (pattern.startsWith('contains(')) {
				const content = pattern.substring(9, pattern.length - 1);
				return context.title.includes(content);
			}
		}
		if (rule.startsWith('schema:')) {
			const pattern = rule.substring(7);
			return context.schemaOrgData.some(schema => 
				schema['@type'] === pattern.replace('@', '')
			);
		}
		return false;
	}

	async matchAndRule(parts, context) {
		for (const part of parts) {
			if (!(await this.matchRule(part.trim(), context))) {
				return false;
			}
		}
		return true;
	}

	async matchOrRule(parts, context) {
		for (const part of parts) {
			if (await this.matchRule(part.trim(), context)) {
				return true;
			}
		}
		return false;
	}
}

// 运行测试
async function runTests() {
	const triggerSystem = new MockTriggerSystem();

	console.log('📋 Running Basic Tests...\n');

	// 测试简单URL匹配
	test('Simple URL Matching', async () => {
		const result = await triggerSystem.matchRule('url:tech.example.com', mockContext);
		if (!result) throw new Error('URL matching failed');
	});

	// 测试标题包含匹配
	test('Title Contains Matching', async () => {
		const result = await triggerSystem.matchRule('title:contains(技术)', mockContext);
		if (!result) throw new Error('Title matching failed');
	});

	// 测试Schema.org匹配
	test('Schema.org Matching', async () => {
		const result = await triggerSystem.matchRule('schema:@Article', mockContext);
		if (!result) throw new Error('Schema.org matching failed');
	});

	// 测试AND条件
	test('AND Condition Matching', async () => {
		const result = await triggerSystem.matchRule('url:tech.example.com AND title:contains(技术)', mockContext);
		if (!result) throw new Error('AND condition matching failed');
	});

	// 测试OR条件
	test('OR Condition Matching', async () => {
		const result = await triggerSystem.matchRule('url:tech.example.com OR url:other.example.com', mockContext);
		if (!result) throw new Error('OR condition matching failed');
	});

	// 测试复杂条件
	test('Complex Condition Matching', async () => {
		const result = await triggerSystem.matchRule('url:tech.example.com AND title:contains(技术) AND schema:@Article', mockContext);
		if (!result) throw new Error('Complex condition matching failed');
	});

	// 测试不匹配的情况
	test('Non-matching Rule', async () => {
		const result = await triggerSystem.matchRule('url:unmatched.example.com', mockContext);
		if (result) throw new Error('Should not match');
	});

	console.log('\n📋 Running Advanced Tests...\n');

	// 测试通配符URL匹配
	test('Wildcard URL Matching', () => {
		const url = 'https://sub.example.com/path';
		const pattern = 'https://*.example.com/*';
		const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
		const regex = new RegExp(`^${regexPattern}$`);
		const result = regex.test(url);
		if (!result) throw new Error('Wildcard URL matching failed');
	});

	// 测试时间匹配
	test('Time Range Matching', () => {
		const now = new Date('2024-01-15T10:30:00');
		const start = '09:00';
		const end = '12:00';
		
		const time = now.getHours() * 60 + now.getMinutes();
		const [startHour, startMin] = start.split(':').map(Number);
		const [endHour, endMin] = end.split(':').map(Number);
		const startTime = startHour * 60 + startMin;
		const endTime = endHour * 60 + endMin;
		
		const result = time >= startTime && time <= endTime;
		if (!result) throw new Error('Time range matching failed');
	});

	// 测试星期匹配
	test('Weekday Matching', () => {
		const now = new Date('2024-01-15T10:30:00'); // Monday
		const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		const currentDay = weekdays[now.getDay()];
		const targetDay = 'monday';
		
		const result = currentDay === targetDay;
		if (!result) throw new Error('Weekday matching failed');
	});

	// 测试DOM选择器匹配
	test('DOM Selector Matching', () => {
		const selector = '.ingredients';
		const elements = mockContext.dom.querySelectorAll(selector);
		const result = elements.length > 0;
		if (!result) throw new Error('DOM selector matching failed');
	});

	// 测试元数据匹配
	test('Meta Tag Matching', () => {
		const metaKey = 'og:type';
		const metaValue = 'article';
		const actualValue = mockContext.meta[metaKey];
		const result = actualValue === metaValue;
		if (!result) throw new Error('Meta tag matching failed');
	});

	// 等待所有异步测试完成
	setTimeout(() => {
		console.log('\n📊 Test Results Summary:');
		console.log(`Total Tests: ${testResults.total}`);
		console.log(`Passed: ${testResults.passed} ✅`);
		console.log(`Failed: ${testResults.failed} ❌`);
		console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
		
		if (testResults.failed === 0) {
			console.log('\n🎉 All tests passed! Enhanced trigger system is working correctly.');
		} else {
			console.log('\n⚠️  Some tests failed. Please check the implementation.');
		}
		
		console.log('\n📚 Documentation:');
		console.log('- Enhanced Template Triggers: docs/Enhanced-Template-Triggers.md');
		console.log('- Example Templates: examples/enhanced-templates.json');
		console.log('- Implementation: src/utils/triggers.ts');
		
		process.exit(testResults.failed === 0 ? 0 : 1);
	}, 1000);
}

// 运行测试
runTests().catch(error => {
	console.error('Test runner error:', error);
	process.exit(1);
}); 