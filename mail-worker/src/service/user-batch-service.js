import BizError from '../error/biz-error';
import userService from './user-service';
import { t } from '../i18n/i18n';
import { genEmailName, genPassword } from '../utils/account-credential-utils';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const userBatchService = {
	async ensureTables(c) {
		await c.env.db.batch([
			c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS user_batch (
					batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL DEFAULT '',
					prefix TEXT NOT NULL DEFAULT '',
					domain TEXT NOT NULL DEFAULT '',
					start_no INTEGER NOT NULL DEFAULT 1,
					count INTEGER NOT NULL DEFAULT 0,
					pad_length INTEGER NOT NULL DEFAULT 0,
					password_length INTEGER NOT NULL DEFAULT 12,
					type INTEGER NOT NULL DEFAULT 1,
					created_by INTEGER NOT NULL DEFAULT 0,
					success_count INTEGER NOT NULL DEFAULT 0,
					fail_count INTEGER NOT NULL DEFAULT 0,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`),
			c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS user_batch_item (
					item_id INTEGER PRIMARY KEY AUTOINCREMENT,
					batch_id INTEGER NOT NULL,
					user_id INTEGER NOT NULL DEFAULT 0,
					email TEXT NOT NULL DEFAULT '',
					password_cipher TEXT NOT NULL DEFAULT '',
					password_iv TEXT NOT NULL DEFAULT '',
					status INTEGER NOT NULL DEFAULT 0,
					error TEXT NOT NULL DEFAULT '',
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_batch_time ON user_batch(batch_id)`),
			c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_batch_item_batch ON user_batch_item(batch_id)`)
		]);
	},

	assertAdmin(c) {
		const loginUser = c.get('user');
		if (!loginUser || loginUser.email !== c.env.admin) {
			throw new BizError(t('unauthorized'), 403);
		}
		return loginUser;
	},

	async create(c, params) {
		const loginUser = this.assertAdmin(c);
		await this.ensureTables(c);

		const options = this.normalizeCreateParams(c, params);
		const batch = await c.env.db.prepare(`
			INSERT INTO user_batch (name, prefix, domain, start_no, count, pad_length, password_length, type, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			RETURNING batch_id, create_time
		`).bind(
			options.name,
			options.prefix,
			options.domain,
			options.startNo,
			options.count,
			options.padLength,
			options.passwordLength,
			options.type,
			loginUser.userId
		).first();

		const items = [];
		let successCount = 0;
		let failCount = 0;

		for (let i = 0; i < options.count; i++) {
			let email = '';
			const password = genPassword();

			try {
				email = await this.genUniqueEmail(c, options.domain, items);
				await userService.add(c, { email, type: options.type, password });
				const userRow = await userService.selectByEmail(c, email);
				const encrypted = await this.encryptPassword(c, password);
				await c.env.db.prepare(`
					INSERT INTO user_batch_item (batch_id, user_id, email, password_cipher, password_iv, status)
					VALUES (?, ?, ?, ?, ?, 0)
				`).bind(batch.batch_id, userRow?.userId || 0, email, encrypted.ciphertext, encrypted.iv).run();
				items.push({ email, password, status: 0, error: '' });
				successCount++;
			} catch (e) {
				const message = e?.message || String(e);
				await c.env.db.prepare(`
					INSERT INTO user_batch_item (batch_id, email, status, error)
					VALUES (?, ?, 1, ?)
				`).bind(batch.batch_id, email, message).run();
				items.push({ email, password: '', status: 1, error: message });
				failCount++;
			}
		}

		await c.env.db.prepare(`
			UPDATE user_batch SET success_count = ?, fail_count = ? WHERE batch_id = ?
		`).bind(successCount, failCount, batch.batch_id).run();

		return {
			batchId: batch.batch_id,
			createTime: batch.create_time,
			successCount,
			failCount,
			items
		};
	},

	normalizeCreateParams(c, params) {
		let { name, domain, count, type } = params;
		domain = String(domain || '').trim();
		name = String(name || '').trim();
		count = Number(count);
		type = Number(type);

		if (!domain) throw new BizError(t('notEmailDomain'));
		if (!domain.startsWith('@')) domain = `@${domain}`;
		if (!c.env.domain.includes(domain.substring(1))) throw new BizError(t('notEmailDomain'));
		if (!Number.isInteger(count) || count < 1 || count > 500) throw new BizError('count must be between 1 and 500');
		if (!Number.isInteger(type) || type < 1) throw new BizError(t('roleNotExist'));

		return {
			name: name || `random-${domain.substring(1)}`,
			prefix: '',
			domain,
			startNo: 0,
			count,
			padLength: 6,
			passwordLength: 8,
			type
		};
	},

	async genUniqueEmail(c, domain, items) {
		const generated = new Set(items.map(item => item.email.toLowerCase()));
		for (let attempt = 0; attempt < 20; attempt++) {
			const email = `${genEmailName()}${domain}`;
			if (generated.has(email.toLowerCase())) continue;
			if (!await userService.selectByEmailIncludeDel(c, email)) return email;
		}
		throw new BizError('failed to generate a unique email');
	},

	async list(c, params) {
		this.assertAdmin(c);
		await this.ensureTables(c);
		let { num, size } = params;
		num = Number(num);
		size = Number(size);
		if (isNaN(num) || num < 1) num = 1;
		if (isNaN(size) || size < 1) size = 10;
		if (size > 50) size = 50;
		const offset = (num - 1) * size;

		const { results } = await c.env.db.prepare(`
			SELECT batch_id AS batchId, name, prefix, domain, start_no AS startNo, count, pad_length AS padLength,
				password_length AS passwordLength, type, created_by AS createdBy, success_count AS successCount,
				fail_count AS failCount, create_time AS createTime
			FROM user_batch
			ORDER BY batch_id DESC
			LIMIT ? OFFSET ?
		`).bind(size, offset).all();
		const { total } = await c.env.db.prepare(`SELECT COUNT(*) AS total FROM user_batch`).first();
		return { list: results, total };
	},

	async items(c, params) {
		this.assertAdmin(c);
		await this.ensureTables(c);
		const batchId = Number(params.batchId);
		if (!Number.isInteger(batchId) || batchId < 1) throw new BizError('batchId cannot be empty');
		const batch = await this.selectBatch(c, batchId);
		if (!batch) throw new BizError('batch does not exist');

		const { results } = await c.env.db.prepare(`
			SELECT item_id AS itemId, batch_id AS batchId, user_id AS userId, email, password_cipher AS passwordCipher,
				password_iv AS passwordIv, status, error, create_time AS createTime
			FROM user_batch_item
			WHERE batch_id = ?
			ORDER BY item_id ASC
		`).bind(batchId).all();

		const list = [];
		for (const item of results) {
			let password = '';
			if (item.status === 0 && item.passwordCipher && item.passwordIv) {
				password = await this.decryptPassword(c, item.passwordCipher, item.passwordIv);
			}
			delete item.passwordCipher;
			delete item.passwordIv;
			list.push({ ...item, password });
		}
		return { batch, list };
	},

	async remove(c, params) {
		this.assertAdmin(c);
		await this.ensureTables(c);
		const batchId = Number(params.batchId);
		if (!Number.isInteger(batchId) || batchId < 1) throw new BizError('batchId cannot be empty');
		await c.env.db.batch([
			c.env.db.prepare(`DELETE FROM user_batch_item WHERE batch_id = ?`).bind(batchId),
			c.env.db.prepare(`DELETE FROM user_batch WHERE batch_id = ?`).bind(batchId)
		]);
	},

	selectBatch(c, batchId) {
		return c.env.db.prepare(`
			SELECT batch_id AS batchId, name, prefix, domain, start_no AS startNo, count, pad_length AS padLength,
				password_length AS passwordLength, type, created_by AS createdBy, success_count AS successCount,
				fail_count AS failCount, create_time AS createTime
			FROM user_batch
			WHERE batch_id = ?
		`).bind(batchId).first();
	},

	async getCryptoKey(c) {
		const material = await crypto.subtle.digest('SHA-256', encoder.encode(`${c.env.jwt_secret}:user-batch-passwords:v1`));
		return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
	},

	async encryptPassword(c, password) {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const key = await this.getCryptoKey(c);
		const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(password));
		return {
			iv: this.bytesToBase64(iv),
			ciphertext: this.bytesToBase64(new Uint8Array(encrypted))
		};
	},

	async decryptPassword(c, ciphertext, iv) {
		const key = await this.getCryptoKey(c);
		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: this.base64ToBytes(iv) },
			key,
			this.base64ToBytes(ciphertext)
		);
		return decoder.decode(decrypted);
	},

	bytesToBase64(bytes) {
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return btoa(binary);
	},

	base64ToBytes(base64) {
		return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
	}
};

export default userBatchService;
