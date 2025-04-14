import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Image as ImageIcon, Upload, RefreshCw } from 'lucide-react';

type SocialMediaAccount = {
  id: string;
  username: string;
  accountType: "INSTAGRAM" | "BLUESKY" | "X";
};

type InstagramImage = {
  id: string;
  url: string;
  caption: string;
};

type AIContentGeneratorProps = {
  socialMediaAccounts: SocialMediaAccount[];
  onGeneratedContent: (content: { caption: string; imageUrls: string[]; contentType: string }) => void;
};

export default function AIContentGenerator({ 
  socialMediaAccounts, 
  onGeneratedContent 
}: AIContentGeneratorProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('text');
  const [textPrompt, setTextPrompt] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedImage, setSelectedImage] = useState<InstagramImage | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState(1);
  const [accountImages, setAccountImages] = useState<InstagramImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [generatedCaption, setGeneratedCaption] = useState('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedLLM, setSelectedLLM] = useState('gemini');
  const [contentType, setContentType] = useState('IMAGE');

  // Fetch Instagram images when account is selected
  useEffect(() => {
    if (selectedAccount) {
      fetchInstagramImages(selectedAccount);
    } else {
      setAccountImages([]);
      setSelectedImage(null);
    }
  }, [selectedAccount]);

  const fetchInstagramImages = async (accountId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/social-media-accounts/${accountId}/images`);
      if (!response.ok) {
        throw new Error('Failed to fetch social media images');
      }
      const data = await response.json();
      setAccountImages(data);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch social media images",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateCaption = async () => {
    let prompt = textPrompt;
    
    if (activeTab === 'existingImage' && selectedImage) {
      prompt = `${prompt} (Based on this image with caption: "${selectedImage.caption}")`;
    } else if (activeTab === 'uploadImage' && uploadedImage) {
      prompt = `${prompt} (Based on the uploaded image)`;
    }
    
    if (!prompt) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a prompt",
      });
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/ai/generate-caption', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, provider: selectedLLM }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate caption');
      }
      
      const data = await response.json();
      setGeneratedMessage(data.message || '');
      setGeneratedCaption(data.caption || '');
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate caption",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateImages = async () => {
    let prompt = textPrompt;
    
    if (activeTab === 'existingImage' && selectedImage) {
      prompt = `${prompt} (Similar to this image: "${selectedImage.caption}")`;
    } else if (activeTab === 'uploadImage' && uploadedImage) {
      prompt = `${prompt} (Based on the uploaded image)`;
    }
    
    if (!prompt) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a prompt",
      });
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/ai/generate-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, count: imageCount, provider: selectedLLM }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate images');
      }
      
      const data = await response.json();
      setGeneratedImages(data.images);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate images",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateContent = () => {
    if (activeTab === 'text') {
      generateCaption();
      generateImages();
    } else if (activeTab === 'existingImage') {
      if (!selectedImage) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please select an image",
        });
        return;
      }
      generateCaption();
      generateImages();
    } else if (activeTab === 'uploadImage') {
      if (!uploadedImage) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Please upload an image",
        });
        return;
      }
      generateCaption();
      generateImages();
    }
  };

  const handleUseGeneratedContent = () => {
    // Use the generated images as-is
    // In a production environment, you would upload these images to a storage service
    // and use the resulting URLs instead of data URLs
    onGeneratedContent({
      caption: generatedCaption,
      imageUrls: generatedImages,
      contentType: contentType,
    });
  };

  return (
    <div className="space-y-6">
      <ScrollArea className="h-[70vh] pr-4">
        <div className="space-y-6">
          {/* Content Type Selection */}
          <div className="space-y-4">
            <Label>Content Type</Label>
            <RadioGroup 
              value={contentType} 
              onValueChange={setContentType}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="IMAGE" id="image-type" />
                <Label htmlFor="image-type">Image</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="VIDEO" id="video-type" />
                <Label htmlFor="video-type">Video</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="BLOG_POST" id="blog-type" />
                <Label htmlFor="blog-type">Blog Post</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="space-y-4">
            <Label>Select AI Model</Label>
            <RadioGroup 
              value={selectedLLM} 
              onValueChange={setSelectedLLM}
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="gemini" id="gemini" />
                <Label htmlFor="gemini">Gemini</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="openai" id="openai" />
                <Label htmlFor="openai">OpenAI</Label>
              </div>
            </RadioGroup>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="text">Text Prompt</TabsTrigger>
              <TabsTrigger value="existingImage">Existing Image</TabsTrigger>
              <TabsTrigger value="uploadImage">Upload Image</TabsTrigger>
            </TabsList>
        
        <TabsContent value="text" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="textPrompt">Enter your prompt</Label>
            <Textarea
              id="textPrompt"
              placeholder="Describe the content you want to generate..."
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </TabsContent>
        
        <TabsContent value="existingImage" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="socialMediaAccount">Select Social Media Account</Label>
            <select
              id="socialMediaAccount"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              <option value="">Select an account</option>
              {socialMediaAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.username} ({account.accountType === "INSTAGRAM" ? "Instagram" : 
                   account.accountType === "BLUESKY" ? "Bluesky" : "X"})
                </option>
              ))}
            </select>
          </div>
          
          {isLoading && selectedAccount ? (
            <div className="flex justify-center items-center h-40">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : accountImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              {accountImages.map((image) => (
                <Card 
                  key={image.id} 
                  className={`cursor-pointer overflow-hidden ${selectedImage?.id === image.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedImage(image)}
                >
                  <CardContent className="p-0">
                    <div className="aspect-square relative">
                      <img 
                        src={image.url} 
                        alt={image.caption} 
                        className="object-cover w-full h-full"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : selectedAccount ? (
            <div className="text-center p-8 border rounded-md">
              <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No images found for this account</p>
            </div>
          ) : null}
          
          {selectedImage && (
            <div className="space-y-2">
              <Label htmlFor="imagePrompt">Additional prompt (optional)</Label>
              <Textarea
                id="imagePrompt"
                placeholder="Add additional details to your prompt..."
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
              />
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="uploadImage" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="uploadImage">Upload an image</Label>
            <div className="flex items-center gap-4">
              <Input
                id="uploadImage"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <label
                htmlFor="uploadImage"
                className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-muted-foreground/25 px-4 py-5 text-center"
              >
                {uploadedImage ? (
                  <div className="relative w-full h-full">
                    <img
                      src={uploadedImage}
                      alt="Uploaded"
                      className="object-contain max-h-full mx-auto"
                    />
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload or drag and drop
                    </p>
                  </>
                )}
              </label>
            </div>
          </div>
          
          {uploadedImage && (
            <div className="space-y-2">
              <Label htmlFor="uploadPrompt">Additional prompt (optional)</Label>
              <Textarea
                id="uploadPrompt"
                placeholder="Add additional details to your prompt..."
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="imageCount">Number of images to generate (max 25)</Label>
            <span className="text-sm text-muted-foreground">{imageCount}</span>
          </div>
          <Slider
            id="imageCount"
            min={1}
            max={25}
            step={1}
            value={[imageCount]}
            onValueChange={(value) => setImageCount(value[0])}
          />
        </div>
        
        <Button 
          onClick={handleGenerateContent} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            'Generate Content'
          )}
        </Button>
      </div>
      
      {(generatedMessage || generatedCaption || generatedImages.length > 0) && (
        <div className="space-y-4 border rounded-md p-4">
          <h3 className="text-lg font-medium">Generated Content</h3>
          
          {generatedMessage && (
            <div className="space-y-2">
              <Label>Content Analysis</Label>
              <div className="p-3 bg-muted rounded-md whitespace-pre-line">
                {generatedMessage}
              </div>
            </div>
          )}
          
          {generatedCaption && (
            <div className="space-y-2">
              <Label>Instagram Caption</Label>
              <div className="p-3 bg-muted rounded-md whitespace-pre-line">
                {generatedCaption}
              </div>
            </div>
          )}
          
          {generatedImages.length > 0 && (
            <div className="space-y-2">
              <Label>Generated Images</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {generatedImages.map((imageUrl, index) => (
                  <div key={index} className="aspect-square relative rounded-md overflow-hidden">
                    <img 
                      src={imageUrl} 
                      alt={`Generated image ${index + 1}`} 
                      className="object-cover w-full h-full"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <Button 
            onClick={handleUseGeneratedContent}
            className="w-full"
          >
            Use Generated Content
          </Button>
        </div>
      )}
        </div>
      </ScrollArea>
    </div>
  );
}