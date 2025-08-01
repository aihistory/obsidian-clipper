import { EnhancedTriggerSystem, RuleParser, createMatcher } from '../src/utils/triggers';
import { Template } from '../src/types/types';

// 模拟模板数据
const mockTemplates: Template[] = [
	{
		id: '1',
		name: '技术博客模板',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '技术博客',
		noteContentFormat: '{{content}}',
		properties: [],
		triggers: [
			'url:https://tech.example.com AND title:contains("技术")',
			'(url:https://dev.example.com OR url:https://*.tech.com) AND schema:@Article'
		]
	},
	{
		id: '2',
		name: '新闻文章模板',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '新闻',
		noteContentFormat: '{{content}}',
		properties: [],
		triggers: [
			'url:https://news.example.com AND title:contains("新闻")',
			'time:between(06:00,22:00) AND schema:@NewsArticle'
		]
	},
	{
		id: '3',
		name: '产品页面模板',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '产品',
		noteContentFormat: '{{content}}',
		properties: [],
		triggers: [
			'schema:@Product AND selector:.product-price',
			'meta:og:type=product'
		]
	},
	{
		id: '4',
		name: '食谱模板',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '食谱',
		noteContentFormat: '{{content}}',
		properties: [],
		triggers: [
			'schema:@Recipe AND title:contains("食谱")',
			'selector:.ingredients AND selector:.instructions'
		]
	}
];

// 模拟上下文数据
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
		querySelectorAll: (selector: string) => {
			if (selector === '.product-price') return [];
			if (selector === '.ingredients') return [{ textContent: '面粉, 鸡蛋, 糖' }];
			if (selector === '.instructions') return [{ textContent: '1. 混合面粉和鸡蛋...' }];
			return [];
		}
	} as any,
	meta: {
		'og:type': 'article',
		'description': '技术文章描述'
	},
	currentTime: new Date('2024-01-15T10:30:00')
};

describe('Enhanced Trigger System', () => {
	let triggerSystem: EnhancedTriggerSystem;

	beforeEach(() => {
		triggerSystem = new EnhancedTriggerSystem();
		triggerSystem.initialize(mockTemplates);
	});

	describe('Rule Parser', () => {
		test('should parse simple URL rules', () => {
			const expression = RuleParser.parse('url:https://example.com');
			expect(expression.toString()).toBe('url:https://example.com');
		});

		test('should parse AND conditions', () => {
			const expression = RuleParser.parse('url:https://example.com AND title:contains("test")');
			expect(expression.toString()).toBe('(url:https://example.com AND title:contains(test))');
		});

		test('should parse OR conditions', () => {
			const expression = RuleParser.parse('url:https://example.com OR url:https://other.com');
			expect(expression.toString()).toBe('(url:https://example.com OR url:https://other.com)');
		});

		test('should parse complex nested conditions', () => {
			const expression = RuleParser.parse('(url:https://example.com AND title:contains("test")) OR schema:@Article');
			expect(expression.toString()).toBe('((url:https://example.com AND title:contains(test)) OR schema:@Article)');
		});

		test('should handle legacy patterns', () => {
			const expression = RuleParser.parse('https://example.com');
			expect(expression.toString()).toBe('url:https://example.com');
		});
	});

	describe('Matchers', () => {
		test('URL matcher should handle simple patterns', async () => {
			const matcher = createMatcher('url', 'https://tech.example.com');
			const result = await matcher.match(mockContext);
			expect(result).toBe(true);
		});

		test('URL matcher should handle wildcards', async () => {
			const matcher = createMatcher('url', 'https://*.example.com/*');
			const result = await matcher.match(mockContext);
			expect(result).toBe(true);
		});

		test('URL matcher should handle regex patterns', async () => {
			const matcher = createMatcher('url', '/^https:\/\/tech\.example\.com\/.*$/');
			const result = await matcher.match(mockContext);
			expect(result).toBe(true);
		});

		test('Title matcher should handle contains operation', async () => {
			const matcher = createMatcher('title', 'contains(技术)');
			const result = await matcher.match(mockContext);
			expect(result).toBe(true);
		});

		test('Title matcher should handle startsWith operation', async () => {
			const matcher = createMatcher('title', 'startsWith(技术文章)');
			const result = await matcher.match(mockContext);
			expect(result).toBe(true);
		});

		test('Schema matcher should handle type matching', async () => {
			const matcher = createMatcher('schema', '@Article');
			const result = await matcher.match(mockContext);
			expect(result).toBe(true);
		});

		test('Selector matcher should handle DOM queries', async () => {
			const matcher = createMatcher('selector', '.ingredients');
			const result = await matcher.match(mockContext);
			expect(result).toBe(true);
		});

		test('Meta matcher should handle meta tag matching', async () => {
			const matcher = createMatcher('meta', 'og:type=article');
			const result = await matcher.match(mockContext);
			expect(result).toBe(true);
		});

		test('Time matcher should handle time range', async () => {
			const matcher = createMatcher('time', 'between(09:00,12:00)');
			const result = await matcher.match(mockContext);
			expect(result).toBe(true);
		});
	});

	describe('Template Matching', () => {
		test('should match technology blog template', async () => {
			const template = await triggerSystem.findMatchingTemplate(mockContext);
			expect(template?.name).toBe('技术博客模板');
		});

		test('should handle complex conditions', async () => {
			const complexContext = {
				...mockContext,
				url: 'https://dev.example.com/article/456',
				title: '开发指南：React最佳实践'
			};
			
			const template = await triggerSystem.findMatchingTemplate(complexContext);
			expect(template?.name).toBe('技术博客模板');
		});

		test('should prioritize templates by order', async () => {
			const context = {
				...mockContext,
				url: 'https://tech.example.com/article/789',
				title: '技术文章'
			};
			
			const template = await triggerSystem.findMatchingTemplate(context);
			expect(template?.name).toBe('技术博客模板');
		});

		test('should return undefined when no match found', async () => {
			const context = {
				...mockContext,
				url: 'https://unmatched.example.com',
				title: '不匹配的标题'
			};
			
			const template = await triggerSystem.findMatchingTemplate(context);
			expect(template).toBeUndefined();
		});
	});

	describe('Error Handling', () => {
		test('should handle invalid regex patterns gracefully', async () => {
			const matcher = createMatcher('url', '/invalid[regex/');
			const result = await matcher.match(mockContext);
			expect(result).toBe(false);
		});

		test('should handle invalid selectors gracefully', async () => {
			const matcher = createMatcher('selector', 'invalid[selector');
			const result = await matcher.match(mockContext);
			expect(result).toBe(false);
		});

		test('should handle missing DOM gracefully', async () => {
			const contextWithoutDOM = { ...mockContext, dom: undefined };
			const matcher = createMatcher('selector', '.test');
			const result = await matcher.match(contextWithoutDOM);
			expect(result).toBe(false);
		});
	});

	describe('Performance', () => {
		test('should cache results appropriately', async () => {
			const startTime = Date.now();
			
			// First match
			await triggerSystem.findMatchingTemplate(mockContext);
			const firstMatchTime = Date.now() - startTime;
			
			// Second match (should be cached)
			const secondStartTime = Date.now();
			await triggerSystem.findMatchingTemplate(mockContext);
			const secondMatchTime = Date.now() - secondStartTime;
			
			// Second match should be faster due to caching
			expect(secondMatchTime).toBeLessThan(firstMatchTime);
		});
	});
});

// 导出测试函数供其他模块使用
export function runTriggerTests() {
	console.log('Running Enhanced Trigger System tests...');
	
	// 这里可以添加更多的测试逻辑
	const testResults = {
		passed: 0,
		failed: 0,
		total: 0
	};
	
	// 简单的测试运行器
	function test(name: string, testFn: () => void | Promise<void>) {
		testResults.total++;
		try {
			const result = testFn();
			if (result instanceof Promise) {
				result.then(() => {
					testResults.passed++;
					console.log(`✓ ${name}`);
				}).catch((error) => {
					testResults.failed++;
					console.error(`✗ ${name}: ${error.message}`);
				});
			} else {
				testResults.passed++;
				console.log(`✓ ${name}`);
			}
		} catch (error) {
			testResults.failed++;
			console.error(`✗ ${name}: ${error.message}`);
		}
	}
	
	// 运行基本测试
	test('Rule Parser - Simple URL', () => {
		const expression = RuleParser.parse('url:https://example.com');
		if (expression.toString() !== 'url:https://example.com') {
			throw new Error('Simple URL parsing failed');
		}
	});
	
	test('Rule Parser - AND Condition', () => {
		const expression = RuleParser.parse('url:https://example.com AND title:contains("test")');
		if (!expression.toString().includes('AND')) {
			throw new Error('AND condition parsing failed');
		}
	});
	
	test('URL Matcher - Simple Pattern', async () => {
		const matcher = createMatcher('url', 'https://tech.example.com');
		const result = await matcher.match(mockContext);
		if (!result) {
			throw new Error('URL matcher failed for simple pattern');
		}
	});
	
	test('Title Matcher - Contains Operation', async () => {
		const matcher = createMatcher('title', 'contains(技术)');
		const result = await matcher.match(mockContext);
		if (!result) {
			throw new Error('Title matcher failed for contains operation');
		}
	});
	
	// 输出测试结果
	setTimeout(() => {
		console.log(`\nTest Results: ${testResults.passed}/${testResults.total} passed, ${testResults.failed} failed`);
	}, 100);
} 