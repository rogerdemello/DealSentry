import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, X, Loader2, ArrowLeft, CheckCircle, Sparkles, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { useProposals } from "@/context/useProposals";
import mammoth from "mammoth";

export default function UploadProposal() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { addProposal, refreshProposals, isApiConnected } = useProposals();
  
  const [file, setFile] = useState<File | null>(null);
  const [clientName, setClientName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'uploading' | 'extracting' | 'analyzing'>('uploading');
  const [isDragging, setIsDragging] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryConnection = async () => {
    setIsRetrying(true);
    try {
      const outcome = await refreshProposals();
      if (outcome === "ok") {
        toast({
          title: "Connected",
          description: "API connection restored successfully",
        });
      } else if (outcome === "skipped") {
        toast({
          title: "Sign in required",
          description: "Please sign in to connect to the API.",
          variant: "destructive",
        });
      } else if (outcome === "unauthorized") {
        toast({
          title: "Session required",
          description: "Please sign in again to use the API.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Still Offline",
          description: "Could not connect to API server. Please ensure it's running.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Connection Failed",
        description: "Please check if the API server is running (npm run server)",
        variant: "destructive",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith(".docx") || droppedFile.name.endsWith(".pdf"))) {
      setFile(droppedFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a DOCX or PDF file",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const extractTextFromDocx = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (error) {
      console.error('Error extracting text:', error);
      return `[Content from ${file.name}]`;
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    if (!clientName?.trim()) {
      toast({
        title: "Company name required",
        description: "Please enter the company name",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadStage('uploading');
    
    try {
      // Stage 1: Upload (0-30%)
      for (let i = 0; i <= 30; i += 6) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setUploadProgress(i);
      }

      // Stage 2: Extract text (30-60%)
      setUploadStage('extracting');
      let content = file.name.replace(/\.(docx|pdf)$/i, "");
      
      if (file.name.endsWith('.docx')) {
        content = await extractTextFromDocx(file);
      }
      
      for (let i = 30; i <= 60; i += 6) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        setUploadProgress(i);
      }

      // Stage 3: Create proposal and analyze (60-100%)
      setUploadStage('analyzing');
      setUploadProgress(60);
      
      const newProposal = await addProposal({
        title: file.name.replace(/\.(docx|pdf)$/i, ""),
        content: content.substring(0, 10000), // Limit content length
        status: 'PENDING',
        metadata: {
          clientName: clientName.trim(),
          region: "North America",
          currency: "USD",
          industry: "General",
        },
        userId: "current-user",
        readinessScore: 0, // Will be set by analysis
      });

      // Analysis is complete, show 100%
      setUploadProgress(100);

      toast({
        title: "Upload Complete!",
        description: isApiConnected 
          ? `"${file.name}" has been uploaded and analyzed successfully`
          : `"${file.name}" has been added (offline mode)`,
      });

      // Ensure context has latest data before navigation
      if (newProposal) {
        await refreshProposals();
        setTimeout(() => {
          navigate(`/proposals/${newProposal.id}/review`);
        }, 300);
      } else {
        navigate('/proposals');
      }

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading your proposal",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const getStageText = () => {
    switch (uploadStage) {
      case 'uploading': return 'Uploading file...';
      case 'extracting': return 'Extracting content...';
      case 'analyzing': return 'AI analyzing proposal...';
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Back link */}
      <Link
        to="/proposals"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Proposals
      </Link>

      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="mb-8"
      >
        <h1 className="font-heading text-2xl font-semibold text-foreground mb-1.5">
          Upload Proposal
        </h1>
        <p className="text-muted-foreground text-[15px]">
          Upload a DOCX or PDF file for AI-powered analysis
        </p>
        {!isApiConnected && (
          <div className="flex items-center gap-2 mt-2">
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Running in offline mode - changes won't be saved to database
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={handleRetryConnection}
              disabled={isRetrying}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="glass-panel"
      >
        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 mb-6 ${
            isDragging
              ? "border-primary bg-primary/[0.03]"
              : file
              ? "border-emerald-400/50 bg-emerald-50/50"
              : "border-border hover:border-primary/40 hover:bg-muted/30"
          }`}
        >
          <input
            type="file"
            accept=".docx,.pdf"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          
          {file ? (
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-foreground text-[15px]">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.preventDefault(); setFile(null); }}
                className="ml-2 text-muted-foreground hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-primary/8 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <p className="text-foreground font-medium mb-1">
                Drop your file here or click to browse
              </p>
              <p className="text-sm text-muted-foreground">
                DOCX or PDF up to 10MB
              </p>
            </>
          )}
        </div>

        {/* Company name (required) */}
        <div className="mb-6">
          <Label htmlFor="clientName" className="text-sm font-medium">
            Company name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="clientName"
            placeholder="e.g., Acme Corporation"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="mt-1.5"
            required
          />
        </div>

        {/* Progress Bar */}
        {isUploading && (
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground flex items-center gap-2">
                {uploadStage === 'analyzing' && <Sparkles className="w-4 h-4 text-primary animate-pulse" />}
                {getStageText()}
              </span>
              <span className="font-medium text-foreground">{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleUpload}
            disabled={!file || !clientName?.trim() || isUploading}
            className="flex-1"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Upload & Analyze
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/proposals")}
            disabled={isUploading}
          >
            Cancel
          </Button>
        </div>
      </motion.div>
    </div>
  );
}