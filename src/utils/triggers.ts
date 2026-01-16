import { Template } from '../types/types';
import { memoize, memoizeWithExpiration } from './memoize';

// ==================== 类型定义 ====================

// Debug configuration for production environment
const DEBUG_TRIGGERS = true; // Temporarily enable for debugging template matching issue

// Debug logging function
function debugLog(...args: any[]): void {
	if (DEBUG_TRIGGERS) {
		console.log(...args);
	}
}

function debugWarn(...args: any[]): void {
	if (DEBUG_TRIGGERS) {
		console.warn(...args);
	}
}

function debugError(...args: any[]): void {
	// Always log errors, but can be controlled if needed
	console.error(...args);
}

interface TriggerMatch {
	template: Template;
	priority: number;
}

interface MatchContext {
	url: string;
	title: string;
	description: string;
	schemaOrgData: any;
	dom?: Document;
	meta?: Record<string, string>;
	currentTime?: Date;
}

interface Matcher {
	type: string;
	match(context: MatchContext): boolean | Promise<boolean>;
	toString(): string;
}

// ==================== 词法分析器 ====================

enum TokenType {
	IDENTIFIER,
	STRING,
	OPERATOR,
	LPAREN,
	RPAREN,
	EOF
}

interface Token {
	type: TokenType;
	value: string;
	position: number;
}

class Lexer {
	private input: string;
	private position: number = 0;
	private tokens: Token[] = [];

	constructor(input: string) {
		this.input = input;
	}

	tokenize(): Token[] {
		this.tokens = [];
		this.position = 0;

		debugLog(`Tokenizing input: ${this.input}`);

		while (this.position < this.input.length) {
			const char = this.input[this.position];
			
			if (this.isWhitespace(char)) {
				this.position++;
				continue;
			}

			if (char === '(') {
				this.tokens.push({ type: TokenType.LPAREN, value: '(', position: this.position });
				this.position++;
				continue;
			}

			if (char === ')') {
				this.tokens.push({ type: TokenType.RPAREN, value: ')', position: this.position });
				this.position++;
				continue;
			}

			if (char === '"' || char === "'") {
				this.readString(char);
				continue;
			}

			// 特殊处理冒号：作为匹配器分隔符
			if (char === ':') {
				this.tokens.push({ type: TokenType.OPERATOR, value: ':', position: this.position });
				this.position++;
				continue;
			}

			if (this.isOperator(char)) {
				this.readOperator();
				continue;
			}

			this.readIdentifier();
		}

		this.tokens.push({ type: TokenType.EOF, value: '', position: this.position });
		debugLog(`Tokenization result:`, this.tokens.map(t => `${t.type}:${t.value}`).join(', '));
		return this.tokens;
	}

	private isWhitespace(char: string): boolean {
		return /\s/.test(char);
	}

	private isOperator(char: string): boolean {
		// 只将逻辑操作符和赋值操作符当作操作符
		// URL相关的字符（: / . - _）不作为操作符处理
		return char === '&' || char === '|' || char === '=' || char === '@';
	}

	private readString(quote: string): void {
		const start = this.position;
		this.position++; // Skip opening quote
		
		while (this.position < this.input.length && this.input[this.position] !== quote) {
			if (this.input[this.position] === '\\') {
				this.position += 2; // Skip escaped character
			} else {
				this.position++;
			}
		}
		
		if (this.position < this.input.length) {
			const value = this.input.substring(start + 1, this.position);
			this.tokens.push({ type: TokenType.STRING, value, position: start });
			this.position++; // Skip closing quote
		} else {
			// 处理未闭合的引号
			const value = this.input.substring(start + 1);
			this.tokens.push({ type: TokenType.STRING, value, position: start });
			debugWarn(`Unclosed string literal: ${quote}${value}`);
		}
	}

	private readOperator(): void {
		const start = this.position;
		let value = '';
		
		// 处理多字符操作符
		if (this.position + 1 < this.input.length) {
			const twoChars = this.input.substring(this.position, this.position + 2);
			if (twoChars === '&&' || twoChars === '||') {
				this.tokens.push({ type: TokenType.OPERATOR, value: twoChars, position: start });
				this.position += 2;
				return;
			}
		}
		
		// 处理单字符操作符
		value = this.input[this.position];
		this.position++;
		
		this.tokens.push({ type: TokenType.OPERATOR, value, position: start });
	}

	private readIdentifier(): void {
		const start = this.position;
		let value = '';
		
		// 允许更多的特殊字符在标识符中，特别是对于URL和路径
		while (this.position < this.input.length && 
			   !this.isWhitespace(this.input[this.position]) && 
			   !this.isOperator(this.input[this.position]) &&
			   this.input[this.position] !== '(' &&
			   this.input[this.position] !== ')' &&
			   this.input[this.position] !== ':') {  // 明确排除冒号
			value += this.input[this.position];
			this.position++;
		}
		
		// 检查是否是逻辑操作符
		if (value === 'AND' || value === 'OR') {
			this.tokens.push({ type: TokenType.OPERATOR, value: value, position: start });
			return;
		}
		
		// 处理特殊情况：如果标识符为空但我们仍然需要前进
		if (value.length === 0 && this.position < this.input.length) {
			value = this.input[this.position];
			this.position++;
		}
		
		if (value.length > 0) {
			this.tokens.push({ type: TokenType.IDENTIFIER, value, position: start });
		}
	}
}

// ==================== 语法分析器 ====================

class Parser {
	private tokens: Token[];
	private position: number = 0;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
	}

	parse(): Expression {
		return this.parseOr();
	}

	private parseOr(): Expression {
		let left = this.parseAnd();
		
		while (this.match(TokenType.OPERATOR, '||') || this.match(TokenType.OPERATOR, 'OR')) {
			const operator = this.advance().value;
			const right = this.parseAnd();
			left = new BinaryExpression(left, operator, right);
		}
		
		return left;
	}

	private parseAnd(): Expression {
		let left = this.parsePrimary();
		
		while (this.match(TokenType.OPERATOR, '&&') || this.match(TokenType.OPERATOR, 'AND')) {
			const operator = this.advance().value;
			const right = this.parsePrimary();
			left = new BinaryExpression(left, operator, right);
		}
		
		return left;
	}

	private parsePrimary(): Expression {
		if (this.match(TokenType.LPAREN)) {
			this.advance(); // Consume '('
			const expr = this.parseOr();
			this.expect(TokenType.RPAREN, "Expected ')'");
			return expr;
		}

		if (this.match(TokenType.IDENTIFIER)) {
			return this.parseMatcher();
		}

		throw new Error(`Unexpected token: ${this.peek().value}`);
	}

	private parseMatcher(): MatcherExpression {
		const identifier = this.advance().value;
		
		debugLog(`Parsing matcher with identifier: ${identifier}`);
		
		// 处理优先级前缀
		if (identifier === 'priority' && this.match(TokenType.OPERATOR, ':')) {
			this.advance(); // Consume ':'
			const priorityValue = this.parseValue();
			
			// 查找下一个匹配器
			if (this.position < this.tokens.length && this.match(TokenType.IDENTIFIER)) {
				const nextIdentifier = this.advance().value;
				
				if (this.match(TokenType.OPERATOR, ':')) {
					this.advance(); // Consume ':'
					const value = this.parseValue();
					const matcher = new MatcherExpression(nextIdentifier, value);
					matcher.priority = parseInt(priorityValue);
					debugLog(`Created priority matcher: ${matcher.toString()}`);
					return matcher;
				}
				
				// Legacy support for simple patterns with priority
				const matcher = new MatcherExpression('url', nextIdentifier);
				matcher.priority = parseInt(priorityValue);
				debugLog(`Created legacy priority matcher: ${matcher.toString()}`);
				return matcher;
			}
			
			throw new Error("Expected matcher after priority");
		}
		
		// 处理标准匹配器格式
		if (this.match(TokenType.OPERATOR, ':')) {
			this.advance(); // Consume ':'
			
			// 对于meta和schema类型，需要特殊处理，因为它们的值可能包含多个冒号
			// 例如: meta:og:type=article 或 schema:@Article:name=维基文库
			if (identifier === 'meta' || identifier === 'schema') {
				// 收集所有后续的标识符、操作符，直到遇到逻辑操作符、括号或结束
				let value = '';
				while (this.position < this.tokens.length) {
					const token = this.tokens[this.position];
					
					// 如果遇到逻辑操作符或括号，停止解析
					if (token.type === TokenType.OPERATOR && (token.value === '&&' || token.value === '||' || token.value === 'AND' || token.value === 'OR')) {
						break;
					}
					if (token.type === TokenType.LPAREN || token.type === TokenType.RPAREN) {
						break;
					}
					
					// 收集所有token
					if (token.type === TokenType.STRING) {
						value += this.advance().value;
					} else if (token.type === TokenType.IDENTIFIER) {
						value += this.advance().value;
					} else if (token.type === TokenType.OPERATOR) {
						// 允许所有操作符（冒号、等号等）
						value += this.advance().value;
					} else {
						break;
					}
				}
				
				debugLog(`Created matcher expression: ${identifier}:${value}`);
				return new MatcherExpression(identifier, value);
			}
			
			// 对于其他类型，使用标准的parseValue()方法
			const value = this.parseValue();
			debugLog(`Created matcher expression: ${identifier}:${value}`);
			return new MatcherExpression(identifier, value);
		}
		
		// 检查是否是有效的匹配器类型
		const validMatcherTypes = ['url', 'title', 'schema', 'selector', 'meta', 'time'];
		if (validMatcherTypes.includes(identifier)) {
			// 这是一个匹配器类型但没有冒号，可能是格式错误
			debugWarn(`Matcher type '${identifier}' found without value. This might be a format error.`);
			throw new Error(`Invalid matcher format: '${identifier}' should be followed by ':' and a value`);
		}
		
		// Legacy support for simple patterns (treat as URL)
		debugLog(`Created legacy URL matcher: ${identifier}`);
		return new MatcherExpression('url', identifier);
	}

	private parseValue(): string {
		if (this.match(TokenType.STRING)) {
			return this.advance().value;
		}
		
		// 处理带括号的函数调用，如 contains("测试") 或 between(09:00,18:00)
		if (this.match(TokenType.IDENTIFIER) && this.position + 1 < this.tokens.length && this.tokens[this.position + 1].type === TokenType.LPAREN) {
			const funcName = this.advance().value;
			this.advance(); // Consume '('
			
			let args = '';
			let depth = 1; // Track nested parentheses
			
			while (this.position < this.tokens.length && depth > 0) {
				const token = this.tokens[this.position];
				
				if (token.type === TokenType.LPAREN) {
					depth++;
					if (depth > 1) {
						args += token.value;
					}
					this.advance();
				} else if (token.type === TokenType.RPAREN) {
					depth--;
					if (depth > 0) {
						args += token.value;
					} else {
						this.advance(); // Consume final ')'
					}
				} else if (token.type === TokenType.STRING) {
					args += this.advance().value;
				} else if (token.type === TokenType.IDENTIFIER) {
					args += this.advance().value;
				} else if (token.type === TokenType.OPERATOR) {
					// 允许函数参数中的操作符（如时间格式中的冒号）
					const op = token.value;
					if (op === ':' || op === ',' || op === '=' || op === '/' || op === '.' || op === '-') {
						args += this.advance().value;
					} else {
						// 其他操作符停止解析
						break;
					}
				} else {
					// 跳过其他token
					this.advance();
				}
			}
			
			return `${funcName}(${args})`;
		}
		
		// 处理标识符，但需要收集所有连续的标识符和操作符
		let value = '';
		while (this.position < this.tokens.length) {
			const token = this.tokens[this.position];
			
			// 如果是字符串，直接返回
			if (token.type === TokenType.STRING) {
				if (value === '') {
					return this.advance().value;
				} else {
					value += this.advance().value;
				}
			}
			// 如果是标识符，添加到值中
			else if (token.type === TokenType.IDENTIFIER) {
				value += this.advance().value;
			}
			// 如果是操作符，检查是否是URL或Schema的一部分
			else if (token.type === TokenType.OPERATOR) {
				const op = token.value;
				// 允许URL中的特殊字符和Schema中的@符号
				if (op === ':' || op === '/' || op === '.' || op === '-' || op === '_' || op === '@' || op === '=') {
					value += this.advance().value;
				} else {
					// 其他操作符停止解析
					break;
				}
			}
			// 其他类型的token停止解析
			else {
				break;
			}
		}
		
		if (value === '') {
			throw new Error("Expected string or identifier");
		}
		
		return value;
	}

	private match(type: TokenType, value?: string): boolean {
		if (this.position >= this.tokens.length) return false;
		const token = this.tokens[this.position];
		return token.type === type && (!value || token.value === value);
	}

	private advance(): Token {
		if (this.position >= this.tokens.length) {
			throw new Error("Unexpected end of input");
		}
		return this.tokens[this.position++];
	}

	private peek(): Token {
		if (this.position >= this.tokens.length) {
			throw new Error("Unexpected end of input");
		}
		return this.tokens[this.position];
	}

	private expect(type: TokenType, message: string): Token {
		if (this.match(type)) {
			return this.advance();
		}
		throw new Error(message);
	}
}

// ==================== 表达式类 ====================

abstract class Expression {
	abstract evaluate(context: MatchContext): boolean | Promise<boolean>;
	abstract toString(): string;
}

class BinaryExpression extends Expression {
	constructor(
		public left: Expression,
		public operator: string,
		public right: Expression
	) {
		super();
	}

	async evaluate(context: MatchContext): Promise<boolean> {
		const leftResult = await this.left.evaluate(context);
		
		// Short-circuit evaluation
		if (this.operator === '&&' || this.operator === 'AND') {
			if (!leftResult) return false;
			return await this.right.evaluate(context);
		}
		
		if (this.operator === '||' || this.operator === 'OR') {
			if (leftResult) return true;
			return await this.right.evaluate(context);
		}
		
		throw new Error(`Unknown operator: ${this.operator}`);
	}

	toString(): string {
		return `(${this.left.toString()} ${this.operator} ${this.right.toString()})`;
	}
}

class MatcherExpression extends Expression {
	public priority: number = 0;
	
	constructor(
		public type: string,
		public value: string
	) {
		super();
	}

	async evaluate(context: MatchContext): Promise<boolean> {
		debugLog(`Evaluating matcher: ${this.toString()}`);
		const matcher = createMatcher(this.type, this.value);
		const result = await matcher.match(context);
		debugLog(`Matcher result: ${result}`);
		return result;
	}

	toString(): string {
		if (this.priority > 0) {
			return `priority:${this.priority} ${this.type}:${this.value}`;
		}
		return `${this.type}:${this.value}`;
	}
}

// ==================== 匹配器实现 ====================

class URLMatcher implements Matcher {
	type = 'url';

	constructor(private pattern: string) {}

	async match(context: MatchContext): Promise<boolean> {
		// Legacy support for simple patterns
		if (!this.pattern.startsWith('/') && !this.pattern.includes('*')) {
			return context.url.startsWith(this.pattern);
		}

		// Regex support
		if (this.pattern.startsWith('/') && this.pattern.endsWith('/')) {
			try {
				const regex = new RegExp(this.pattern.slice(1, -1));
				return regex.test(context.url);
			} catch (error) {
				console.error(`Invalid regex pattern: ${this.pattern}`, error);
				return false;
			}
		}

		// Wildcard support
		if (this.pattern.includes('*')) {
			const regexPattern = this.pattern
				.replace(/\./g, '\\.')
				.replace(/\*/g, '.*');
			try {
				const regex = new RegExp(`^${regexPattern}$`);
				return regex.test(context.url);
			} catch (error) {
				console.error(`Invalid wildcard pattern: ${this.pattern}`, error);
				return false;
			}
		}

		return false;
	}

	toString(): string {
		return `url:${this.pattern}`;
	}
}

class SchemaMatcher implements Matcher {
	type = 'schema';
	private schemaType: string | null = null;
	private schemaKey: string | null = null;
	private expectedValue: string | null = null;

	constructor(private pattern: string) {
		// 解析复杂的Schema.org匹配模式
		this.parsePattern(pattern);
	}

	private parsePattern(pattern: string): void {
		// 处理格式如 schema:@Article:name=维基文库
		if (pattern.includes(':') && pattern.includes('=')) {
			const parts = pattern.split(':');
			const typePart = parts[0]; // @Article
			
			// 处理带有=的部分
			const valueParts = parts.slice(1).join(':').split('=');
			this.schemaKey = valueParts[0];
			this.expectedValue = valueParts[1];
			
			// 处理@前缀
			if (typePart.startsWith('@')) {
				this.schemaType = typePart.substring(1);
			} else {
				this.schemaType = typePart;
			}
			
			debugLog(`Schema matcher parsed: type=${this.schemaType}, key=${this.schemaKey}, value=${this.expectedValue}`);
		} else {
			// 保持原有解析逻辑
			debugLog(`Using default schema pattern parsing for: ${pattern}`);
		}
	}

	async match(context: MatchContext): Promise<boolean> {
		// Input validation - following URLMatcher pattern
		if (!context.schemaOrgData) {
			debugWarn('SchemaMatcher: context.schemaOrgData is undefined');
			return false;
		}
		
		// Handle complex patterns with proper error handling - like URLMatcher's pattern handling
		try {
			if (this.schemaType && this.schemaKey && this.expectedValue) {
				debugLog(`SchemaMatcher: matching complex pattern - type=${this.schemaType}, key=${this.schemaKey}, value=${this.expectedValue}`);
				
				// Normalize schema data - similar to URLMatcher's input normalization
				const schemaArray = Array.isArray(context.schemaOrgData) 
					? context.schemaOrgData 
					: [context.schemaOrgData];
				
				const flatSchemas = schemaArray.flatMap(schema => {
					return Array.isArray(schema) ? schema : [schema];
				});
				
				debugLog(`SchemaMatcher: found ${flatSchemas.length} schema objects to check`);
				
				// Process each schema with error handling
				for (const schema of flatSchemas) {
					try {
						// Type validation
						const types = Array.isArray(schema['@type']) ? schema['@type'] : [schema['@type']];
						if (!types.includes(this.schemaType)) continue;
						
						// Value extraction
						const actualValue = this.getSchemaValue(schema, this.schemaKey);
						if (actualValue === undefined) continue;
						
						// Value comparison with normalization - like URLMatcher's clean pattern matching
						const cleanExpectedValue = this.expectedValue.replace(/^["']|["']$/g, '');
						if (Array.isArray(actualValue)) {
							if (actualValue.includes(cleanExpectedValue)) {
								debugLog(`SchemaMatcher: match found - ${this.schemaType}.${this.schemaKey}=${cleanExpectedValue}`);
								return true;
							}
						} else if (String(actualValue).toLowerCase() === cleanExpectedValue.toLowerCase()) {
							debugLog(`SchemaMatcher: match found - ${this.schemaType}.${this.schemaKey}=${cleanExpectedValue}`);
							return true;
						}
					} catch (schemaError) {
						console.error(`SchemaMatcher: error processing individual schema`, schemaError);
						continue;
					}
				}
				
				debugLog('SchemaMatcher: no matching schema found with custom logic');
				return false;
			}
			
			// Fallback to legacy pattern matching - like URLMatcher's simple pattern fallback
			debugLog(`SchemaMatcher: using legacy pattern matching for: ${this.pattern}`);
			return matchSchemaPattern(this.pattern, context.schemaOrgData);
		} catch (error) {
			console.error(`SchemaMatcher error with pattern: ${this.pattern}`, error);
			return false;
		}
	}
	
	private getSchemaValue(schemaData: any, key: string): any {
		const keys = key.split('.');
		let result = schemaData;
		for (const k of keys) {
			if (result && typeof result === 'object' && k in result) {
				result = result[k];
			} else {
				return undefined;
			}
		}
		return result;
	}

	toString(): string {
		if (this.schemaType && this.schemaKey && this.expectedValue) {
			return `schema:@${this.schemaType}:${this.schemaKey}=${this.expectedValue}`;
		}
		return `schema:${this.pattern}`;
	}
}

class TitleMatcher implements Matcher {
	type = 'title';

	constructor(private pattern: string, private operation: string = 'contains') {}

	async match(context: MatchContext): Promise<boolean> {
		// Input validation - following URLMatcher pattern
		if (!context.title || typeof context.title !== 'string') {
			debugWarn('Title matcher: context.title is undefined or not a string');
			return false;
		}

		// Clean and normalize inputs - following URLMatcher pattern
		const title = context.title.toLowerCase();
		const cleanPattern = this.pattern.replace(/^["']|["']$/g, '').toLowerCase();

		debugLog(`TitleMatcher: comparing "${title}" with "${cleanPattern}" using ${this.operation}`);

		// Handle different operation types with proper error handling - like URLMatcher's pattern types
		try {
			switch (this.operation) {
				case 'contains':
					return title.includes(cleanPattern);
				case 'startsWith':
					return title.startsWith(cleanPattern);
				case 'endsWith':
					return title.endsWith(cleanPattern);
				case 'regex':
					// Regex support with error handling - similar to URLMatcher
					const regex = new RegExp(cleanPattern);
					return regex.test(context.title);
				case 'equals':
					return title === cleanPattern;
				default:
					// Default fallback - like URLMatcher's simple pattern fallback
					return title.includes(cleanPattern);
			}
		} catch (error) {
			console.error(`TitleMatcher error with pattern: ${this.pattern}, operation: ${this.operation}`, error);
			return false;
		}
	}

	toString(): string {
		return `title:${this.operation}(${this.pattern})`;
	}
}

class SelectorMatcher implements Matcher {
	type = 'selector';

	constructor(private selector: string) {}

	async match(context: MatchContext): Promise<boolean> {
		// Input validation - following URLMatcher pattern
		if (!context.dom) {
			debugWarn('SelectorMatcher: context.dom is undefined');
			return false;
		}

		if (!this.selector || typeof this.selector !== 'string') {
			debugWarn('SelectorMatcher: selector is undefined or not a string');
			return false;
		}

		// Execute with proper error handling - like URLMatcher's regex handling
		try {
			const elements = context.dom.querySelectorAll(this.selector);
			const result = elements.length > 0;
			debugLog(`SelectorMatcher: selector "${this.selector}" found ${elements.length} elements`);
			return result;
		} catch (error) {
			console.error(`SelectorMatcher error with selector: ${this.selector}`, error);
			return false;
		}
	}

	toString(): string {
		return `selector:${this.selector}`;
	}
}

class MetaMatcher implements Matcher {
	type = 'meta';

	constructor(private key: string, private value?: string) {
		debugLog(`MetaMatcher created with key: "${this.key}", value: "${this.value || 'undefined'}"`);
	}

	async match(context: MatchContext): Promise<boolean> {
		// Input validation - following URLMatcher pattern
		if (!context.meta) {
			debugWarn('MetaMatcher: context.meta is undefined');
			return false;
		}

		if (!this.key || typeof this.key !== 'string') {
			debugWarn('MetaMatcher: key is undefined or not a string');
			return false;
		}
		
		debugLog(`MetaMatcher: checking key "${this.key}" for value "${this.value || '任意值'}"`);
		debugLog('Available meta tags:', Object.keys(context.meta).join(', '));
		
		// Handle different key formats with fallbacks - like URLMatcher's pattern handling
		let metaValue;
		try {
			if (this.key.includes(':')) {
				// Support multiple key formats - similar to URLMatcher's wildcard/regex support
				const possibleKeys = [
					this.key,                     // og:title
					`property:${this.key}`,       // property:og:title  
					`name:${this.key}`,           // name:og:title
					this.key.replace(':', '_')    // og_title
				];
				
				for (const key of possibleKeys) {
					if (context.meta[key]) {
						metaValue = context.meta[key];
						debugLog(`Found meta value for key "${key}": "${metaValue}"`);
						break;
					}
				}
			} else {
				// Simple key lookup - like URLMatcher's simple pattern
				metaValue = context.meta[this.key];
			}
		} catch (error) {
			console.error(`MetaMatcher error processing key: ${this.key}`, error);
			return false;
		}
		
		if (!metaValue) {
			debugWarn(`Meta value not found for key "${this.key}"`);
			return false;
		}
		
		// Value comparison with proper handling - following URLMatcher pattern
		if (this.value) {
			try {
				const cleanValue = this.value.replace(/^["']|["']$/g, '');
				const result = metaValue.toLowerCase() === cleanValue.toLowerCase();
				debugLog(`Comparing meta value: "${metaValue}" with "${cleanValue}", result: ${result}`);
				return result;
			} catch (error) {
				console.error(`MetaMatcher error comparing values: ${this.value}`, error);
				return false;
			}
		}
		
		return true;
	}

	toString(): string {
		return this.value ? `meta:${this.key}=${this.value}` : `meta:${this.key}`;
	}
}

class TimeMatcher implements Matcher {
	type = 'time';

	constructor(private condition: string) {}

	async match(context: MatchContext): Promise<boolean> {
		// Input validation - following URLMatcher pattern
		if (!this.condition || typeof this.condition !== 'string') {
			debugWarn('TimeMatcher: condition is undefined or not a string');
			return false;
		}

		const now = context.currentTime || new Date();
		debugLog(`TimeMatcher: evaluating condition "${this.condition}" at ${now.toISOString()}`);
		
		// Parse time conditions with error handling - like URLMatcher's regex parsing
		try {
			const match = this.condition.match(/(\w+)\(([^)]+)\)/);
			if (!match) {
				debugWarn(`TimeMatcher: invalid condition format: ${this.condition}`);
				return false;
			}
			
			const [, operation, params] = match;
			debugLog(`TimeMatcher: operation="${operation}", params="${params}"`);
			
			// Handle different operation types - like URLMatcher's pattern type handling
			switch (operation) {
				case 'between':
					const [start, end] = params.split(',').map(p => p.trim());
					return this.isTimeBetween(now, start, end);
				case 'weekday':
					const targetDay = params.toLowerCase().trim();
					return this.isWeekday(now, targetDay);
				default:
					debugWarn(`TimeMatcher: unknown operation: ${operation}`);
					return false;
			}
		} catch (error) {
			console.error(`TimeMatcher error with condition: ${this.condition}`, error);
			return false;
		}
	}

	private isTimeBetween(date: Date, start: string, end: string): boolean {
		try {
			const time = date.getHours() * 60 + date.getMinutes();
			const [startHour, startMin] = start.split(':').map(Number);
			const [endHour, endMin] = end.split(':').map(Number);
			const startTime = startHour * 60 + startMin;
			const endTime = endHour * 60 + endMin;
			
			const result = time >= startTime && time <= endTime;
			debugLog(`TimeMatcher: time ${time} between ${startTime}-${endTime}: ${result}`);
			return result;
		} catch (error) {
			console.error(`TimeMatcher error in isTimeBetween: ${start}-${end}`, error);
			return false;
		}
	}

	private isWeekday(date: Date, targetDay: string): boolean {
		try {
			const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
			const currentDay = weekdays[date.getDay()];
			const result = currentDay === targetDay;
			debugLog(`TimeMatcher: current day "${currentDay}" matches target "${targetDay}": ${result}`);
			return result;
		} catch (error) {
			console.error(`TimeMatcher error in isWeekday: ${targetDay}`, error);
			return false;
		}
	}

	toString(): string {
		return `time:${this.condition}`;
	}
}

// ==================== 匹配器工厂 ====================

function createMatcher(type: string, value: string): Matcher {
	debugLog(`Creating matcher: type=${type}, value=${value}`);
	
	switch (type) {
		case 'url':
			return new URLMatcher(value);
			
		case 'schema':
			// 处理复杂的schema格式: schema:@Article:name=维基文库
			if (value.includes(':') && value.includes('=')) {
				debugLog(`Creating complex schema matcher for: ${value}`);
				return new SchemaMatcher(value);
			}
			return new SchemaMatcher(value);
			
		case 'title':
			// 处理标题操作: contains(text)、regex(/pattern/)等
			// 使用更宽松的正则表达式，支持中文字符和特殊字符
			const titleMatch = value.match(/([a-zA-Z_][a-zA-Z0-9_]*)\(([^)]+)\)/);
			if (titleMatch) {
				const [, operation, pattern] = titleMatch;
				debugLog(`Creating title matcher with operation: ${operation}, pattern: ${pattern}`);
				return new TitleMatcher(pattern, operation);
			}
			debugLog(`Creating simple title matcher with pattern: ${value}`);
			return new TitleMatcher(value);
			
		case 'selector':
			return new SelectorMatcher(value);
			
		case 'meta':
			// 处理meta标签: property:og:title=维基文库
			if (value.includes(':')) {
				const equalsPos = value.indexOf('=');
				
				if (equalsPos > 0) {
					// 有等号，如 property:og:title=维基文库
					const key = value.substring(0, equalsPos);
					const val = value.substring(equalsPos + 1);
					debugLog(`Creating meta matcher with key: ${key}, value: ${val}`);
					return new MetaMatcher(key, val);
				} else {
					// 无等号，如 property:og:title
					debugLog(`Creating meta matcher with key: ${value}`);
					return new MetaMatcher(value);
				}
			}
			
			// 处理简单meta格式: name=value
			const metaMatch = value.match(/([^=]+)=(.+)/);
			if (metaMatch) {
				const [, key, val] = metaMatch;
				debugLog(`Creating meta matcher with key: ${key}, value: ${val}`);
				return new MetaMatcher(key, val);
			}
			
			debugLog(`Creating meta matcher with key: ${value}`);
			return new MetaMatcher(value);
			
		case 'time':
			return new TimeMatcher(value);
			
		default:
			debugWarn(`Unknown matcher type: ${type}, defaulting to URL matcher`);
			return new URLMatcher(value);
	}
}

// ==================== 规则解析器 ====================

class RuleParser {
	static parse(rule: string): Expression {
		try {
			debugLog(`Parsing rule: ${rule}`);
			const lexer = new Lexer(rule);
			const tokens = lexer.tokenize();
			const parser = new Parser(tokens);
			const result = parser.parse();
			debugLog(`Successfully parsed rule: ${rule} -> ${result.toString()}`);
			return result;
		} catch (error) {
			console.error(`Failed to parse rule: ${rule}`, error);
			
			// 检查是否是简单的URL模式（向后兼容）
			if (!rule.includes(':') && !rule.includes(' ') && !rule.includes('(') && !rule.includes(')')) {
				debugLog(`Treating as legacy URL pattern: ${rule}`);
				return new MatcherExpression('url', rule);
			}
			
			// 检查是否是简单的匹配器格式（如 title:value）
			const simpleMatcherMatch = rule.match(/^(\w+):(.+)$/);
			if (simpleMatcherMatch) {
				const [, type, value] = simpleMatcherMatch;
				debugLog(`Treating as simple matcher: ${type}:${value}`);
				return new MatcherExpression(type, value);
			}
			
			// 如果都不是，抛出更详细的错误
			throw new Error(`Failed to parse rule: ${rule}. Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

// ==================== 增强的触发器系统 ====================

class EnhancedTriggerSystem {
	private rules: Array<{ template: Template; expression: Expression; priority: number }> = [];
	private isInitialized = false;

	initialize(templates: Template[]): void {
		this.rules = [];
		debugLog(`EnhancedTriggerSystem: Initializing with ${templates.length} templates`);
		
		templates.forEach((template, index) => {
			if (template.triggers) {
				debugLog(`EnhancedTriggerSystem: Processing template "${template.name}" with ${template.triggers.length} triggers`);
				template.triggers.forEach(trigger => {
					const priority = templates.length - index;
					debugLog(`EnhancedTriggerSystem: Parsing trigger: ${trigger} (priority: ${priority})`);
					
					try {
						const expression = RuleParser.parse(trigger);
						this.rules.push({ template, expression, priority });
						debugLog(`EnhancedTriggerSystem: Successfully added rule: ${expression.toString()} for template "${template.name}"`);
					} catch (error) {
						console.error(`EnhancedTriggerSystem: Failed to parse trigger "${trigger}" for template "${template.name}":`, error);
						// 不要添加失败的规则，让系统继续处理其他规则
					}
				});
			}
		});

		this.isInitialized = true;
		debugLog(`EnhancedTriggerSystem: Initialization completed with ${this.rules.length} rules`);
	}

	async findMatchingTemplate(context: MatchContext): Promise<Template | undefined> {
		if (!this.isInitialized) {
			debugWarn('Enhanced triggers not initialized. Call initialize first.');
			return undefined;
		}

		// Sort by priority (higher priority first)
		const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

		for (const { template, expression } of sortedRules) {
			try {
				const matches = await expression.evaluate(context);
				if (matches) {
					debugLog(`Template matched: ${template.name} with rule: ${expression.toString()}`);
					return template;
				}
			} catch (error) {
				console.error(`Error evaluating rule for template ${template.name}:`, error);
			}
		}

		return undefined;
	}
}

// ==================== 向后兼容的旧系统 ====================

// 保持原有的 Trie 实现用于向后兼容
class TrieNode {
	children: Map<string, TrieNode> = new Map();
	templates: TriggerMatch[] = [];
}

class Trie {
	root: TrieNode = new TrieNode();

	insert(url: string, template: Template, priority: number) {
		let node = this.root;
		for (const char of url) {
			if (!node.children.has(char)) {
				node.children.set(char, new TrieNode());
			}
			node = node.children.get(char)!;
		}
		node.templates.push({ template, priority });
	}

	findLongestMatch(url: string, schemaOrgData: any): TriggerMatch | null {
		let node = this.root;
		let lastMatch: TriggerMatch | null = null;
		for (const char of url) {
			if (!node.children.has(char)) break;
			node = node.children.get(char)!;
			if (node.templates.length > 0) {
				const matchingTemplate = node.templates.find(() => 
					memoizedInternalMatchPattern(url.slice(0, url.indexOf(char) + 1), url, schemaOrgData)
				);
				if (matchingTemplate) {
					lastMatch = matchingTemplate;
				}
			}
		}
		return lastMatch;
	}
}

// ==================== 公共接口 ====================

const urlTrie = new Trie();
const regexTriggers: Array<{ template: Template; regex: RegExp; priority: number }> = [];
const schemaTriggers: Array<{ template: Template; pattern: string; priority: number }> = [];
const enhancedSystem = new EnhancedTriggerSystem();

let isInitialized = false;

// 修改后的 memoizedInternalMatchPattern 函数
const memoizedInternalMatchPattern = memoize(
	(pattern: string, url: string, schemaOrgData: any): boolean => {
		if (pattern.startsWith('schema:')) {
			return matchSchemaPattern(pattern, schemaOrgData);
		} else if (pattern.startsWith('/') && pattern.endsWith('/')) {
			try {
				const regexPattern = new RegExp(pattern.slice(1, -1));
				const result = regexPattern.test(url);
				return result;
			} catch (error) {
				console.error(`Invalid regex pattern: ${pattern}`, error);
				return false;
			}
		} else {
			return url.startsWith(pattern);
		}
	},
	{
		resolver: (pattern: string, url: string) => {
			if (pattern.startsWith('/') && pattern.endsWith('/')) {
				return `${pattern}:${url}`;
			}
			return `${pattern}:${url.split('/').slice(0, 3).join('/')}`;
		}
	}
);

export function initializeTriggers(templates: Template[]): void {
	debugLog(`Initializing triggers with ${templates.length} templates`);
	
	// 初始化增强系统
	enhancedSystem.initialize(templates);
	
	// 保持向后兼容的初始化
	urlTrie.root = new TrieNode();
	regexTriggers.length = 0;
	schemaTriggers.length = 0;

	templates.forEach((template, index) => {
		if (template.triggers) {
			debugLog(`Processing template "${template.name}" with ${template.triggers.length} triggers`);
			template.triggers.forEach(trigger => {
				const priority = templates.length - index;
				debugLog(`Processing trigger: ${trigger} (priority: ${priority})`);
				
				// 增强系统已经处理了所有触发器，这里只处理旧系统的兼容性
				if (trigger.startsWith('/') && trigger.endsWith('/')) {
					debugLog(`Adding regex trigger: ${trigger}`);
					regexTriggers.push({ template, regex: new RegExp(trigger.slice(1, -1)), priority });
				} else if (trigger.startsWith('schema:')) {
					debugLog(`Adding schema trigger: ${trigger}`);
					schemaTriggers.push({ template, pattern: trigger, priority });
				} else if (!trigger.includes(':') && !trigger.includes(' ') && !trigger.includes('(') && !trigger.includes(')')) {
					// 只有简单的URL模式才添加到旧系统
					debugLog(`Adding legacy URL trigger: ${trigger}`);
					urlTrie.insert(trigger, template, priority);
				} else {
					debugLog(`Skipping complex trigger for legacy system: ${trigger} (will be handled by enhanced system)`);
				}
			});
		}
	});

	isInitialized = true;
	debugLog(`Triggers initialization completed. Enhanced system: ${enhancedSystem['rules'].length} rules, Legacy system: ${regexTriggers.length} regex + ${schemaTriggers.length} schema + ${urlTrie.root.children.size} URL patterns`);
}

const memoizedFindMatchingTemplate = memoizeWithExpiration(
	async (url: string, getPageData: () => Promise<{
		title?: string;
		description?: string;
		schemaOrgData: any;
		dom?: Document;
		meta?: Record<string, string>;
	}>): Promise<Template | undefined> => {
		if (!isInitialized) {
			debugWarn('Triggers not initialized. Call initializeTriggers first.');
			return undefined;
		}

		debugLog(`Finding matching template for URL: ${url}`);
		
		// 获取页面数据 - 添加错误处理
		let pageData;
		try {
			pageData = await getPageData();
		} catch (error) {
			debugError('Error getting page data:', error);
			return undefined;
		}
		
		if (!pageData) {
			debugWarn('Page data is null or undefined');
			return undefined;
		}
		
		const { title = '', description = '', schemaOrgData, dom, meta = {} } = pageData;
		
		debugLog(`Page data: title="${title}", description="${description.substring(0, 50)}..."`);
		debugLog(`Meta tags:`, Object.keys(meta).join(', '));
		
		// 获取当前时间
		const currentTime = new Date();
		debugLog(`Current time: ${currentTime.toLocaleString()}`);

		// 首先尝试增强系统
		const context: MatchContext = {
			url,
			title,
			description,
			schemaOrgData,
			dom,
			meta,
			currentTime
		};

		debugLog('Trying enhanced trigger system...');
		let enhancedMatch;
		try {
			enhancedMatch = await enhancedSystem.findMatchingTemplate(context);
			if (enhancedMatch) {
				debugLog(`Enhanced match found: ${enhancedMatch.name}`);
				return enhancedMatch;
			}
		} catch (error) {
			debugError('Error in enhanced trigger system:', error);
			// Continue to fallback system
		}

		// 回退到旧系统
		debugLog('Falling back to legacy trigger system...');
		const urlMatch = urlTrie.findLongestMatch(url, schemaOrgData);
		if (urlMatch) {
			debugLog(`URL match found: ${urlMatch.template.name}`);
			return urlMatch.template;
		}

		for (const { template, pattern } of schemaTriggers) {
			if (matchSchemaPattern(pattern, schemaOrgData)) {
				debugLog(`Schema match found: ${template.name}`);
				return template;
			}
		}

		for (const { template, regex } of regexTriggers) {
			if (regex.test(url)) {
				debugLog(`Regex match found: ${template.name}`);
				return template;
			}
		}

		debugLog('No matching template found');
		return undefined;
	},
	{
		expirationMs: 30000,
		keyFn: (url: string) => url
	}
);

export const findMatchingTemplate = memoizedFindMatchingTemplate;

export function matchPattern(pattern: string, url: string, schemaOrgData: any): boolean {
	return memoizedInternalMatchPattern(pattern, url, schemaOrgData);
}

// ==================== Schema.org 匹配函数 ====================

function matchSchemaPattern(pattern: string, schemaOrgData: any): boolean {
	const [, schemaType, schemaKey, expectedValue] = pattern.match(/schema:(@\w+)?(?:\.(.+?))?(?:=(.+))?$/) || [];
	
	if (!schemaType && !schemaKey) return false;

	const schemaArray = Array.isArray(schemaOrgData) ? schemaOrgData : [schemaOrgData];

	const matchingSchemas = schemaArray.flatMap(schema => {
		if (Array.isArray(schema)) {
			return schema;
		}
		return [schema];
	}).filter((schema: any) => {
		if (!schemaType) return true;
		const types = Array.isArray(schema['@type']) ? schema['@type'] : [schema['@type']];
		return types.includes(schemaType.slice(1));
	});

	for (const schema of matchingSchemas) {
		if (schemaKey) {
			const actualValue = getSchemaValue(schema, schemaKey);
			if (expectedValue) {
				if (Array.isArray(actualValue)) {
					if (actualValue.includes(expectedValue)) return true;
				} else if (actualValue === expectedValue) {
					return true;
				}
			} else if (actualValue !== undefined) {
				return true;
			}
		} else {
			return true;
		}
	}

	return false;
}

function getSchemaValue(schemaData: any, key: string): any {
	const keys = key.split('.');
	let result = schemaData;
	for (const k of keys) {
		if (result && typeof result === 'object' && k in result) {
			result = result[k];
		} else {
			return undefined;
		}
	}
	return result;
}

// ==================== 导出新功能 ====================

export { EnhancedTriggerSystem, RuleParser, createMatcher };
export type { MatchContext, Matcher, Expression };