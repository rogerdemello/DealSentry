import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import mammoth from 'mammoth';

const router = Router();

// POST upload file
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const { file, fileName, proposalId } = req.body;

    if (!file || !fileName) {
      return res.status(400).json({ error: 'File and fileName are required' });
    }

    // Decode base64 file if needed
    const fileBuffer = Buffer.from(file, 'base64');
    
    // Generate unique file path
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `proposals/${timestamp}_${sanitizedFileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('proposal-files')
      .upload(filePath, fileBuffer, {
        contentType: 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      console.error('Supabase storage error:', error);
      
      // If bucket doesn't exist, return a helpful error
      if (error.message?.includes('not found')) {
        return res.status(500).json({ 
          error: 'Storage bucket not configured. Please create a "proposal-files" bucket in Supabase Storage.',
          details: error.message 
        });
      }
      
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('proposal-files')
      .getPublicUrl(filePath);

    // Extract text from DOCX if applicable
    let extractedText = null;
    if (fileName.endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
      } catch (extractError) {
        console.error('Error extracting text from DOCX:', extractError);
      }
    }

    res.json({
      success: true,
      fileUrl: urlData.publicUrl,
      filePath: data.path,
      extractedText,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET file
router.get('/download/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = `proposals/${filename}`;

    const { data, error } = await supabase.storage
      .from('proposal-files')
      .download(filePath);

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Convert blob to buffer and send
    const buffer = await data.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// DELETE file
router.delete('/delete/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = `proposals/${filename}`;

    const { error } = await supabase.storage
      .from('proposal-files')
      .remove([filePath]);

    if (error) throw error;

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// POST extract text from document
router.post('/extract-text', async (req: Request, res: Response) => {
  try {
    const { file, fileName } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const fileBuffer = Buffer.from(file, 'base64');
    let extractedText = '';

    if (fileName.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = result.value;
    } else if (fileName.endsWith('.txt')) {
      extractedText = fileBuffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload .docx or .txt files.' });
    }

    res.json({
      success: true,
      extractedText,
      wordCount: extractedText.split(/\s+/).length,
      charCount: extractedText.length,
    });
  } catch (error) {
    console.error('Error extracting text:', error);
    res.status(500).json({ error: 'Failed to extract text from file' });
  }
});

export default router;
