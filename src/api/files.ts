import { Router, Request, Response } from 'express';
import mammoth from 'mammoth';
import { supabase } from '../lib/supabase';
import { requireAuth, isAdmin } from './middleware/auth';
import { isLoginMode } from './lib/authConfig';
import { logger } from './lib/logger';

const router = Router();

const BUCKET = 'proposal-files';
const KEY_ROOT = 'proposals';

/** Largest decoded upload accepted (the JSON body limit is 10 MB, base64 inflates ~33%). */
export const MAX_FILE_BYTES = 7 * 1024 * 1024;

/** Lifetime of the download link returned after an upload. */
const SIGNED_URL_SECONDS = 60 * 60;

/** Document types the app can store, with the Content-Type they are served as. */
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  rtf: 'application/rtf',
};

const extensionOf = (fileName: string): string => fileName.split('.').pop()?.toLowerCase() ?? '';

/** Storage folder holding one user's files. */
const userFolder = (userId: string): string => `${KEY_ROOT}/${userId}/`;

/**
 * Turn the URL tail into a storage key, or null if it is not a plausible one.
 * Keys are `proposals/<userId>/<timestamp>_<name>`; the older `<name>` form
 * (before per-user folders) is accepted and mapped under `proposals/`.
 */
export function toStorageKey(segments: string[] | string | undefined): string | null {
  const parts = (Array.isArray(segments) ? segments : [segments ?? '']).flatMap((s) => s.split('/'));
  if (parts.length === 0 || parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  return parts[0] === KEY_ROOT ? parts.join('/') : `${KEY_ROOT}/${parts.join('/')}`;
}

/**
 * May the caller touch this stored file? Admins can reach everything. Everyone
 * else is confined to their own folder; legacy flat keys are open in demo mode
 * (single-tenant) but admin-only once real sign-in is on.
 */
export function canAccessFile(key: string, req: Request): boolean {
  if (isAdmin(req)) return true;
  if (req.user && key.startsWith(userFolder(req.user.id))) return true;
  return !isLoginMode() && key.split('/').length === 2;
}

/** Plain-text extraction for the formats we can read server-side. */
async function extractText(buffer: Buffer, fileName: string): Promise<string | null> {
  const ext = extensionOf(fileName);
  if (ext === 'docx') return (await mammoth.extractRawText({ buffer })).value;
  if (ext === 'txt' || ext === 'md') return buffer.toString('utf-8');
  return null;
}

// POST upload file
router.post('/upload', requireAuth, async (req: Request, res: Response) => {
  try {
    const { file, fileName } = req.body;

    if (typeof file !== 'string' || !file || typeof fileName !== 'string' || !fileName) {
      return res.status(400).json({ error: 'File and fileName are required' });
    }

    const ext = extensionOf(fileName);
    if (!CONTENT_TYPES[ext]) {
      return res.status(400).json({ error: `Unsupported file type. Allowed: ${Object.keys(CONTENT_TYPES).join(', ')}` });
    }

    // Decode base64 file
    const fileBuffer = Buffer.from(file, 'base64');
    if (fileBuffer.length === 0) {
      return res.status(400).json({ error: 'The file is empty' });
    }
    if (fileBuffer.length > MAX_FILE_BYTES) {
      return res.status(413).json({ error: `File is too large (limit ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} MB)` });
    }

    // Per-user folder + timestamp keeps names unique and keeps users apart.
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userFolder(req.user!.id)}${Date.now()}_${sanitizedFileName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, fileBuffer, { contentType: CONTENT_TYPES[ext], upsert: false });

    if (error) {
      logger.error('Supabase storage error:', error);

      // If bucket doesn't exist, return a helpful error
      if (error.message?.includes('not found')) {
        return res.status(500).json({
          error: 'Storage bucket not configured. Run prisma/manual/storage_bucket.sql or create a "proposal-files" bucket in Supabase Storage.',
          details: error.message,
        });
      }

      throw error;
    }

    // A signed link works whether the bucket is public or private.
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, SIGNED_URL_SECONDS);
    const fileUrl = signed?.signedUrl ?? supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;

    // Extract text from DOCX if applicable
    let extractedText: string | null = null;
    if (ext === 'docx') {
      try {
        extractedText = await extractText(fileBuffer, fileName);
      } catch (extractError) {
        logger.error('Error extracting text from DOCX:', extractError);
      }
    }

    res.json({
      success: true,
      fileUrl,
      filePath: data.path,
      extractedText,
    });
  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET file. The path is the `filePath` returned by upload.
router.get('/download/*filePath', requireAuth, async (req: Request, res: Response) => {
  try {
    const key = toStorageKey(req.params.filePath);
    if (!key) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (!canAccessFile(key, req)) {
      return res.status(403).json({ error: 'You do not have access to this file' });
    }

    const { data, error } = await supabase.storage.from(BUCKET).download(key);

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'File not found' });
    }

    const name = key.split('/').pop() ?? 'file';
    res.setHeader('Content-Type', CONTENT_TYPES[extensionOf(name)] ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
    res.send(Buffer.from(await data.arrayBuffer()));
  } catch (error) {
    logger.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// DELETE file. The path is the `filePath` returned by upload.
router.delete('/delete/*filePath', requireAuth, async (req: Request, res: Response) => {
  try {
    const key = toStorageKey(req.params.filePath);
    if (!key) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (!canAccessFile(key, req)) {
      return res.status(403).json({ error: 'You do not have access to this file' });
    }

    const { error } = await supabase.storage.from(BUCKET).remove([key]);

    if (error) throw error;

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// POST extract text from document
router.post('/extract-text', requireAuth, async (req: Request, res: Response) => {
  try {
    const { file, fileName } = req.body;

    if (typeof file !== 'string' || !file || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'File and fileName are required' });
    }

    const fileBuffer = Buffer.from(file, 'base64');
    if (fileBuffer.length > MAX_FILE_BYTES) {
      return res.status(413).json({ error: `File is too large (limit ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} MB)` });
    }

    const extractedText = await extractText(fileBuffer, fileName);
    if (extractedText === null) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload .docx, .txt or .md files.' });
    }

    res.json({
      success: true,
      extractedText,
      wordCount: extractedText.split(/\s+/).filter(Boolean).length,
      charCount: extractedText.length,
    });
  } catch (error) {
    logger.error('Error extracting text:', error);
    res.status(500).json({ error: 'Failed to extract text from file' });
  }
});

export default router;
