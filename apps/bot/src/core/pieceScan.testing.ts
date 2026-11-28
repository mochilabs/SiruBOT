import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { PIECE_ROOTS } from './pieceRoots.ts';

export const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORES = ['commands', 'listeners', 'interaction-handlers', 'preconditions'] as const;
const PIECE_BASES = new Set(['Command', 'Subcommand', 'Listener', 'InteractionHandler', 'Precondition', 'AllFlowsPrecondition']);

export interface Piece {
	key: string;
	category: string | null;
	file: string;
}

function walk(dir: string): string[] {
	const result: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) result.push(...walk(full));
		else result.push(full);
	}
	return result;
}

const stringProp = (obj: ts.ObjectLiteralExpression, prop: string): string | undefined => {
	for (const p of obj.properties) {
		if (ts.isPropertyAssignment(p) && p.name.getText() === prop && ts.isStringLiteralLike(p.initializer)) return p.initializer.text;
	}
	return undefined;
};

const arrayProp = (obj: ts.ObjectLiteralExpression, prop: string): string[] | undefined => {
	for (const p of obj.properties) {
		if (ts.isPropertyAssignment(p) && p.name.getText() === prop && ts.isArrayLiteralExpression(p.initializer)) {
			return p.initializer.elements.filter(ts.isStringLiteralLike).map((e) => e.text);
		}
	}
	return undefined;
};

function readPieces(root: string, store: string, file: string): Piece[] {
	const base = path.basename(file, '.ts');
	const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const pieces: Piece[] = [];
	for (const node of source.statements) {
		if (!ts.isClassDeclaration(node) || !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
		const extendsExpr = node.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
		if (!extendsExpr || !PIECE_BASES.has(extendsExpr.getText())) continue;

		const optionObjects: ts.ObjectLiteralExpression[] = [];
		for (const decorator of ts.getDecorators(node) ?? []) {
			const call = decorator.expression;
			if (
				ts.isCallExpression(call) &&
				call.expression.getText() === 'ApplyOptions' &&
				call.arguments[0] &&
				ts.isObjectLiteralExpression(call.arguments[0])
			) {
				optionObjects.push(call.arguments[0]);
			}
		}
		const visit = (n: ts.Node): void => {
			if (
				ts.isCallExpression(n) &&
				n.expression.kind === ts.SyntaxKind.SuperKeyword &&
				n.arguments[1] &&
				ts.isObjectLiteralExpression(n.arguments[1])
			) {
				optionObjects.push(n.arguments[1]);
			}
			ts.forEachChild(n, visit);
		};
		visit(node);

		const name = optionObjects.map((o) => stringProp(o, 'name')).find((n) => n !== undefined) ?? base;
		const category = optionObjects.map((o) => arrayProp(o, 'fullCategory')).find((c) => c !== undefined);
		const derived = `(folder:${path
			.relative(path.join(SRC_ROOT, root, store), path.dirname(file))
			.split(path.sep)
			.join('/')})`;
		pieces.push({
			key: `${store}:${name}`,
			category: store === 'commands' ? (category?.join('/') ?? derived) : null,
			file: path.relative(SRC_ROOT, file)
		});
	}
	return pieces;
}

export function collectPieces(): Piece[] {
	const pieces: Piece[] = [];
	for (const root of PIECE_ROOTS) {
		for (const store of STORES) {
			const dir = path.join(SRC_ROOT, root, store);
			let files: string[];
			try {
				files = walk(dir);
			} catch {
				continue;
			}
			for (const file of files) {
				const name = path.basename(file);
				if (!name.endsWith('.ts') || name.endsWith('.d.ts') || name.endsWith('.test.ts') || name.startsWith('_')) continue;
				pieces.push(...readPieces(root, store, file));
			}
		}
	}
	return pieces;
}
