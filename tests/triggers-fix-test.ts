import { initializeTriggers, findMatchingTemplate } from '../src/utils/triggers';
import { Template } from '../src/types/types';

// 模拟页面数据获取函数
const mockGetPageData = () => Promise.resolve({
	title: '测试文章标题',
	description: '这是一个测试文章的描述',
	schemaOrgData: {
		'@type': 'Article',
		'name': '维基文库',
		'author': '张三'
	},
	meta: {
		'og:title': 'Open Graph 标题',
		'description': '页面描述'
	}
});

// 测试模板
const testTemplates: Template[] = [
	{
		id: 'url-test',
		name: 'URL匹配器测试',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '/',
		noteContentFormat: 'URL匹配器内容',
		properties: [],
		triggers: ['url:https://example.com']
	},
	{
		id: 'title-test',
		name: '标题匹配器测试',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '/',
		noteContentFormat: '标题匹配器内容',
		properties: [],
		triggers: ['title:contains("测试")']
	},
	{
		id: 'schema-test',
		name: 'Schema匹配器测试',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '/',
		noteContentFormat: 'Schema匹配器内容',
		properties: [],
		triggers: ['schema:@Article']
	},
	{
		id: 'meta-test',
		name: 'Meta匹配器测试',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '/',
		noteContentFormat: 'Meta匹配器内容',
		properties: [],
		triggers: ['meta:og:title']
	},
	{
		id: 'selector-test',
		name: '选择器匹配器测试',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '/',
		noteContentFormat: '选择器匹配器内容',
		properties: [],
		triggers: ['selector:.article-content']
	},
	{
		id: 'combined-test',
		name: '组合条件测试',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '/',
		noteContentFormat: '组合条件内容',
		properties: [],
		triggers: ['url:https://example.com AND title:contains("测试")']
	},
	{
		id: 'complex-schema-test',
		name: '复杂Schema测试',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '/',
		noteContentFormat: '复杂Schema内容',
		properties: [],
		triggers: ['schema:@Article:name=维基文库']
	}
];

async function runTests() {
	console.log('开始测试触发器系统...\n');
	
	// 初始化触发器系统
	initializeTriggers(testTemplates);
	
	// 测试URL匹配器
	console.log('=== 测试URL匹配器 ===');
	const urlMatch = await findMatchingTemplate('https://example.com/article', mockGetPageData);
	console.log(`URL匹配结果: ${urlMatch?.name || '无匹配'}\n`);
	
	// 测试标题匹配器
	console.log('=== 测试标题匹配器 ===');
	const titleMatch = await findMatchingTemplate('https://other.com', mockGetPageData);
	console.log(`标题匹配结果: ${titleMatch?.name || '无匹配'}\n`);
	
	// 测试Schema匹配器
	console.log('=== 测试Schema匹配器 ===');
	const schemaMatch = await findMatchingTemplate('https://schema.com', mockGetPageData);
	console.log(`Schema匹配结果: ${schemaMatch?.name || '无匹配'}\n`);
	
	// 测试Meta匹配器
	console.log('=== 测试Meta匹配器 ===');
	const metaMatch = await findMatchingTemplate('https://meta.com', mockGetPageData);
	console.log(`Meta匹配结果: ${metaMatch?.name || '无匹配'}\n`);
	
	// 测试组合条件
	console.log('=== 测试组合条件 ===');
	const combinedMatch = await findMatchingTemplate('https://example.com', mockGetPageData);
	console.log(`组合条件匹配结果: ${combinedMatch?.name || '无匹配'}\n`);
	
	// 测试复杂Schema
	console.log('=== 测试复杂Schema ===');
	const complexSchemaMatch = await findMatchingTemplate('https://complex.com', mockGetPageData);
	console.log(`复杂Schema匹配结果: ${complexSchemaMatch?.name || '无匹配'}\n`);
	
	console.log('测试完成！');
}

// 如果直接运行此文件
if (typeof window === 'undefined') {
	runTests().catch(console.error);
}

export { runTests }; 