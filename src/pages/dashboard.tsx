import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { Instagram, Plus, Calendar, Image, Trash2, Edit, RefreshCw, Settings } from "lucide-react";
import { useRouter } from "next/router";
import ProtectedRoute from "@/components/ProtectedRoute";
import AIContentGenerator from "@/components/AIContentGenerator";
import LogsViewer from "@/components/LogsViewer";
import { CalendarView } from "@/components/CalendarView";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";

type SocialMediaAccount = {
  id: string;
  username: string;
  accessToken: string;
  accountType: "INSTAGRAM" | "BLUESKY" | "X";
};

type ContentPost = {
  id: string;
  caption: string;
  imageUrl?: string;
  contentType: "IMAGE" | "VIDEO" | "BLOG_POST";
  videoType?: "FEED" | "REELS" | null;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  scheduledFor?: string;
  igMediaId?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  socialMediaAccountId?: string;
  socialMediaAccount?: {
    username: string;
    accountType: string;
  } | null;
};

// Component for editing social media account details
function EditAccountForm({ account, onSuccess }: { account: SocialMediaAccount; onSuccess: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    username: account.username,
    accessToken: account.accessToken,
    accountType: account.accountType,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username || !formData.accessToken) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/social-media-accounts/${account.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update social media account');
      }
      
      toast({
        title: "Success",
        description: "Social media account updated successfully",
      });
      
      onSuccess();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update social media account",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="edit-account-type">Account Type</Label>
          <select
            id="edit-account-type"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={formData.accountType}
            onChange={(e) => setFormData({...formData, accountType: e.target.value as "INSTAGRAM" | "BLUESKY" | "X"})}
          >
            <option value="INSTAGRAM">Instagram</option>
            <option value="BLUESKY">Bluesky</option>
            <option value="X">X</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="edit-username">Username</Label>
          <Input
            id="edit-username"
            value={formData.username}
            onChange={(e) => setFormData({...formData, username: e.target.value})}
            placeholder="your_username"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="edit-token">Access Token</Label>
          <Input
            id="edit-token"
            type="password"
            value={formData.accessToken}
            onChange={(e) => setFormData({...formData, accessToken: e.target.value})}
            placeholder="Your API access token"
          />
          <p className="text-sm text-muted-foreground">
            You can get your access token from the respective platform's developer portal.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            "Update Account"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const [accounts, setAccounts] = useState<SocialMediaAccount[]>([]);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ username: "", accessToken: "", accountType: "INSTAGRAM" as "INSTAGRAM" | "BLUESKY" | "X" });
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [newPost, setNewPost] = useState({
    caption: "",
    imageUrl: "",
    imageFile: null as File | null,
    socialMediaAccountId: "",
    contentType: "IMAGE",
    videoType: "FEED" as "FEED" | "REELS",
    scheduledFor: null as string | null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  
  // Instagram Insights state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [isGeneratingInspired, setIsGeneratingInspired] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  // Scheduling dialog state
  const [isScheduling, setIsScheduling] = useState(false);
  const [schedulingPostId, setSchedulingPostId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleHour, setScheduleHour] = useState<number>(12);
  const [scheduleMinute, setScheduleMinute] = useState<number>(0);
  const [scheduleAccountId, setScheduleAccountId] = useState<string>("");

  // Insights state
  const [postInsights, setPostInsights] = useState<any[]>([]);
  const [accountInsights, setAccountInsights] = useState<any[]>([]);
  const [isFetchingInsights, setIsFetchingInsights] = useState(false);
  const [selectedInsightsAccountId, setSelectedInsightsAccountId] = useState<string>("");

  // Discovery state
  const [searchType, setSearchType] = useState<'hashtag' | 'account'>('hashtag');
  const [accountSearchResults, setAccountSearchResults] = useState<any[]>([]);
  const [contentIdeas, setContentIdeas] = useState<any[]>([]);
  const [trackedHashtags, setTrackedHashtags] = useState<any[]>([]);
  const [trackedCompetitors, setTrackedCompetitors] = useState<any[]>([]);

  // AI Recommendations state
  const [recommendations, setRecommendations] = useState<any>(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [captionReview, setCaptionReview] = useState<any>(null);
  const [isReviewingCaption, setIsReviewingCaption] = useState(false);

  // Fetch social media accounts and content posts
  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        try {
          // Fetch social media accounts
          const accountsResponse = await fetch('/api/social-media-accounts', { credentials: 'include' });
          if (accountsResponse.ok) {
            const accountsData = await accountsResponse.json();
            setAccounts(accountsData);
          } else {
            const errorText = await accountsResponse.text();
            console.error('Failed to fetch social media accounts:', accountsResponse.status, errorText);
            toast({
              variant: "destructive",
              title: "Error",
              description: `Failed to fetch social media accounts. Status: ${accountsResponse.status}`,
            });
          }
          
          // Fetch content posts
          const postsResponse = await fetch('/api/content-posts', { credentials: 'include' });
          if (postsResponse.ok) {
            const postsData = await postsResponse.json();
            setPosts(postsData);
          } else {
            console.error('Failed to fetch content posts');
          }
          
          setIsLoading(false);
        } catch (error) {
          console.error('Error fetching data:', error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to load your data. Please try again.",
          });
          setIsLoading(false);
        }
      };

      fetchData();
      fetchContentIdeas();
      fetchTrackedHashtags();
      fetchTrackedCompetitors();
    }
  }, [user, toast]);

  const handleAddAccount = async () => {
    if (!newAccount.username || !newAccount.accessToken || !newAccount.accountType) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }

    try {
      const response = await fetch('/api/social-media-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAccount),
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add social media account');
      }
      
      const newAccountData = await response.json();
      setAccounts([...accounts, newAccountData]);
      setNewAccount({ username: "", accessToken: "", accountType: "INSTAGRAM" });
      setIsAddingAccount(false);
      
      toast({
        title: "Success",
        description: "Social media account added successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add social media account",
      });
    }
  };

  const handleCreatePost = async (saveAsDraft: boolean = false) => {
    if (!newPost.caption) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please add a caption for your post",
      });
      return;
    }

    // Instagram caption validation
    if (newPost.caption.length > 2200) {
      toast({
        variant: "destructive",
        title: "Caption too long",
        description: `Caption is ${newPost.caption.length} characters. Instagram allows a maximum of 2,200 characters.`,
      });
      return;
    }

    // Instagram hashtag limit validation
    const hashtagCount = (newPost.caption.match(/#\w+/g) || []).length;
    if (hashtagCount > 30) {
      toast({
        variant: "destructive",
        title: "Too many hashtags",
        description: `Your caption has ${hashtagCount} hashtags. Instagram allows a maximum of 30.`,
      });
      return;
    }

    // Show a loading toast for the operation
    const loadingToastId = Date.now().toString();

    try {
      // Handle file upload if a file was selected
      let imageUrl = newPost.imageUrl;
      
      if (newPost.imageFile) {
        // Create a FormData object to upload the file
        const formData = new FormData();
        formData.append('file', newPost.imageFile);
        
        try {
          // Show loading toast
          toast({
            title: "Uploading image",
            description: "Please wait while we upload your image...",
          });
          
          // Upload the file to our upload API
          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          
          if (!uploadResponse.ok) {
            let errorMessage = 'Failed to upload image';
            try {
              const errorData = await uploadResponse.json();
              errorMessage = errorData.error || errorMessage;
            } catch (jsonError) {
              console.error('Error parsing upload API response:', jsonError);
              
              // Handle specific HTTP status codes
              if (uploadResponse.status === 405) {
                errorMessage = 'Upload method not allowed. Please try again or contact support.';
              } else {
                errorMessage = `Upload failed with status: ${uploadResponse.status} ${uploadResponse.statusText}`;
              }
            }
            console.error('Upload error details:', { 
              status: uploadResponse.status, 
              statusText: uploadResponse.statusText,
              errorMessage 
            });
            throw new Error(errorMessage);
          }
          
          let uploadData;
          try {
            uploadData = await uploadResponse.json();
          } catch (jsonError) {
            console.error('Error parsing upload response JSON:', jsonError);
            throw new Error('Invalid response from upload server. Please try again.');
          }
          
          if (!uploadData || !uploadData.url) {
            throw new Error('Upload server returned an invalid response');
          }
          
          imageUrl = uploadData.url; // Use the URL returned from the server
          
          // Success toast
          toast({
            title: "Image uploaded",
            description: "Your image has been uploaded successfully.",
          });
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
          toast({
            variant: "destructive",
            title: "Error",
            description: uploadError instanceof Error ? uploadError.message : "Failed to upload image. Please try again or use an image URL instead.",
          });
          return;
        }
      } else if (imageUrl && imageUrl.startsWith('data:')) {
        // If we have a data URL but no file, we need to process it
        try {
          toast({
            title: "Processing image",
            description: "Please wait while we process your image...",
          });
          
          // Convert data URL to file
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const file = new File([blob], `image-${Date.now()}.jpg`, { type: 'image/jpeg' });
          
          // Create a FormData object to upload the file
          const formData = new FormData();
          formData.append('file', file);
          
          // Upload the file
          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          
          if (!uploadResponse.ok) {
            let errorMessage = 'Failed to process image';
            try {
              const errorData = await uploadResponse.json();
              errorMessage = errorData.error || errorMessage;
            } catch (jsonError) {
              console.error('Error parsing upload API response:', jsonError);
              
              // Handle specific HTTP status codes
              if (uploadResponse.status === 405) {
                errorMessage = 'Upload method not allowed. Please try again or contact support.';
              } else {
                errorMessage = `Image processing failed with status: ${uploadResponse.status} ${uploadResponse.statusText}`;
              }
            }
            console.error('Image processing error details:', { 
              status: uploadResponse.status, 
              statusText: uploadResponse.statusText,
              errorMessage 
            });
            throw new Error(errorMessage);
          }
          
          let uploadData;
          try {
            uploadData = await uploadResponse.json();
          } catch (jsonError) {
            console.error('Error parsing upload response JSON:', jsonError);
            throw new Error('Invalid response from upload server. Please try again.');
          }
          
          if (!uploadData || !uploadData.url) {
            throw new Error('Upload server returned an invalid response');
          }
          
          imageUrl = uploadData.url; // Use the URL returned from the server
          
          toast({
            title: "Image processed",
            description: "Your image has been processed successfully.",
          });
        } catch (processError) {
          console.error('Error processing image:', processError);
          toast({
            variant: "destructive",
            title: "Error",
            description: processError instanceof Error ? processError.message : "Failed to process image. Please try again or use a different image.",
          });
          return;
        }
      }
      
      // Check if the image URL is too long
      if (imageUrl && imageUrl.length > 2000) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Image URL is too long. Please use a shorter URL or a different image.",
        });
        return;
      }

      // Create a copy of the post data to send to the API
      const postData = {
        caption: newPost.caption,
        imageUrl: imageUrl,
        contentType: newPost.contentType,
        // Include videoType if it's a video
        ...(newPost.contentType === 'VIDEO' ? { videoType: newPost.videoType } : {}),
        // Set status to DRAFT if saveAsDraft is true
        ...(saveAsDraft ? { status: 'DRAFT' } : {}),
        // Include scheduledFor if it's set
        ...(newPost.scheduledFor ? { scheduledFor: newPost.scheduledFor } : {}),
        // Only include socialMediaAccountId if it's not empty
        ...(newPost.socialMediaAccountId && newPost.socialMediaAccountId.trim() !== ''
          ? { socialMediaAccountId: newPost.socialMediaAccountId }
          : {})
      };

      // Show a loading toast for creating the post
      toast({
        title: saveAsDraft ? "Saving draft..." : "Creating post...",
        description: "Please wait...",
      });

      const response = await fetch('/api/content-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
        credentials: 'include',
      });
      
      let errorMessage = 'Failed to create post';
      
      // Handle different error responses
      if (!response.ok) {
        // Try to parse the error response as JSON
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (jsonError) {
          // If we can't parse the JSON, use the status text and code
          if (response.status === 413) {
            errorMessage = 'The post content is too large. Try using a shorter image URL or reducing the caption length.';
          } else {
            errorMessage = `${response.statusText || 'Error'} (${response.status})`;
          }
          console.error('Error parsing API response:', jsonError);
        }
        throw new Error(errorMessage);
      }
      
      let newPostData;
      try {
        newPostData = await response.json();
      } catch (jsonError) {
        console.error('Error parsing post creation response:', jsonError);
        throw new Error('Server returned an invalid response. Your post might have been created but could not be displayed.');
      }
      
      setPosts([...posts, newPostData]);
      setNewPost({
        caption: "",
        imageUrl: "",
        imageFile: null,
        socialMediaAccountId: "",
        contentType: "IMAGE",
        videoType: "FEED",
        scheduledFor: null
      });
      setIsCreatingPost(false);
      
      toast({
        title: "Success",
        description: saveAsDraft ? "Post saved to drafts" : "Post created successfully",
      });
    } catch (error) {
      console.error('Error creating post:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create post",
      });
    }
  };
  
  const handleGeneratedContent = (content: { caption: string; imageUrls: string[]; contentType: string }) => {
    setNewPost({
      ...newPost,
      caption: content.caption,
      imageUrl: content.imageUrls[0] || "",
      imageFile: null,
      contentType: content.contentType,
      scheduledFor: null
    });
    setIsGeneratingContent(false);
    setIsCreatingPost(true);
    
    toast({
      title: "Content Generated",
      description: "AI-generated content has been added to your post",
    });
  };

  // Instagram Insights functions
  const handleInstagramSearch = async () => {
    if (!searchQuery.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a search term" });
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    setAccountSearchResults([]);
    try {
      const response = await fetch(
        `/api/instagram/search?query=${encodeURIComponent(searchQuery)}&type=${searchType}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search Instagram content');
      }

      const data = await response.json();
      if (data.searchType === 'account') {
        setAccountSearchResults(data.results || []);
        toast({ title: "Search Complete", description: `Found ${data.results?.length || 0} accounts` });
      } else {
        setSearchResults(data.results || []);
        toast({ title: "Search Complete", description: `Found ${data.results?.length || 0} posts` });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to search" });
    } finally {
      setIsSearching(false);
    }
  };

  // Content Ideas functions
  const fetchContentIdeas = async () => {
    try {
      const response = await fetch('/api/content-ideas', { credentials: 'include' });
      if (response.ok) setContentIdeas(await response.json());
    } catch (error) { console.error('Error fetching content ideas:', error); }
  };

  const saveAsIdea = async (post: any) => {
    try {
      const response = await fetch('/api/content-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: post.permalink || '',
          sourceAccountName: post.username || '',
          sourceCaption: post.caption || '',
          sourceImageUrl: post.imageUrl || '',
          sourceLikes: post.likes || 0,
          sourceComments: post.comments || 0,
          tags: post.hashtags || [],
        }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to save idea');
      toast({ title: "Saved", description: "Post saved to your content ideas" });
      fetchContentIdeas();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save idea" });
    }
  };

  const deleteIdea = async (id: string) => {
    try {
      await fetch(`/api/content-ideas/${id}`, { method: 'DELETE', credentials: 'include' });
      setContentIdeas(contentIdeas.filter(i => i.id !== id));
      toast({ title: "Deleted", description: "Content idea removed" });
    } catch { toast({ variant: "destructive", title: "Error", description: "Failed to delete idea" }); }
  };

  const updateIdeaStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/content-ideas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include',
      });
      if (response.ok) {
        setContentIdeas(contentIdeas.map(i => i.id === id ? { ...i, status } : i));
      }
    } catch { /* silent */ }
  };

  // Tracked Hashtags functions
  const fetchTrackedHashtags = async () => {
    try {
      const response = await fetch('/api/discovery/tracked-hashtags', { credentials: 'include' });
      if (response.ok) setTrackedHashtags(await response.json());
    } catch { /* silent */ }
  };

  const trackHashtag = async (hashtag: string) => {
    try {
      const response = await fetch('/api/discovery/tracked-hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashtag }),
        credentials: 'include',
      });
      if (response.status === 409) { toast({ title: "Already tracked", description: `#${hashtag.replace(/^#/, '')} is already in your list` }); return; }
      if (!response.ok) throw new Error('Failed to track hashtag');
      toast({ title: "Tracked", description: `Now tracking #${hashtag.replace(/^#/, '')}` });
      fetchTrackedHashtags();
    } catch { toast({ variant: "destructive", title: "Error", description: "Failed to track hashtag" }); }
  };

  const untrackHashtag = async (id: string) => {
    try {
      await fetch('/api/discovery/tracked-hashtags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        credentials: 'include',
      });
      setTrackedHashtags(trackedHashtags.filter(h => h.id !== id));
    } catch { /* silent */ }
  };

  // Tracked Competitors functions
  const fetchTrackedCompetitors = async () => {
    try {
      const response = await fetch('/api/discovery/tracked-competitors', { credentials: 'include' });
      if (response.ok) setTrackedCompetitors(await response.json());
    } catch { /* silent */ }
  };

  const trackCompetitor = async (username: string) => {
    try {
      const response = await fetch('/api/discovery/tracked-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
        credentials: 'include',
      });
      if (response.status === 409) { toast({ title: "Already tracked", description: `@${username.replace(/^@/, '')} is already in your list` }); return; }
      if (!response.ok) throw new Error('Failed to track competitor');
      toast({ title: "Tracked", description: `Now tracking @${username.replace(/^@/, '')}` });
      fetchTrackedCompetitors();
    } catch { toast({ variant: "destructive", title: "Error", description: "Failed to track competitor" }); }
  };

  const untrackCompetitor = async (id: string) => {
    try {
      await fetch('/api/discovery/tracked-competitors', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        credentials: 'include',
      });
      setTrackedCompetitors(trackedCompetitors.filter(c => c.id !== id));
    } catch { /* silent */ }
  };

  const refreshCompetitor = async (competitorId: string) => {
    try {
      const response = await fetch('/api/discovery/refresh-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId }),
        credentials: 'include',
      });
      if (response.ok) {
        const updated = await response.json();
        setTrackedCompetitors(trackedCompetitors.map(c => c.id === competitorId ? updated : c));
        toast({ title: "Updated", description: "Competitor data refreshed" });
      }
    } catch { toast({ variant: "destructive", title: "Error", description: "Failed to refresh competitor" }); }
  };

  // AI Recommendations functions
  const getRecommendations = async (type: 'general' | 'hashtag_suggestions' = 'general') => {
    setIsLoadingRecommendations(true);
    setRecommendations(null);
    try {
      const response = await fetch('/api/ai/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get recommendations');
      }
      const data = await response.json();
      setRecommendations(data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to get recommendations" });
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const reviewCaption = async (caption: string) => {
    setIsReviewingCaption(true);
    setCaptionReview(null);
    try {
      const response = await fetch('/api/ai/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'caption_review', caption }),
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to review caption');
      }
      const data = await response.json();
      setCaptionReview(data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to review caption" });
    } finally {
      setIsReviewingCaption(false);
    }
  };

  const handleGenerateInspiredContent = async (post: any) => {
    setIsGeneratingInspired(true);
    try {
      const response = await fetch('/api/instagram/inspire', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inspirationPost: post,
          contentType: 'IMAGE',
          customPrompt: customPrompt.trim() || undefined
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to generate inspired content');
      }

      const data = await response.json();
      
      // Set the generated content to the new post form
      setNewPost({
        caption: data.generatedContent.caption || "",
        imageUrl: data.generatedContent.imageUrls?.[0] || "",
        imageFile: null,
        socialMediaAccountId: "",
        contentType: "IMAGE",
        videoType: "FEED",
        scheduledFor: null
      });
      
      // Close insights and open create post dialog
      setSelectedPost(null);
      setCustomPrompt("");
      setIsCreatingPost(true);
      
      toast({
        title: "Content Generated",
        description: "AI-generated content inspired by the selected post has been created",
      });
    } catch (error) {
      console.error('Error generating inspired content:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate inspired content",
      });
    } finally {
      setIsGeneratingInspired(false);
    }
  };

  // Schedule a post
  const handleSchedulePost = async () => {
    if (!schedulingPostId || !scheduleDate) {
      toast({ variant: "destructive", title: "Error", description: "Please select a date and time" });
      return;
    }

    const scheduledDateTime = new Date(scheduleDate);
    scheduledDateTime.setHours(scheduleHour, scheduleMinute, 0, 0);

    if (scheduledDateTime <= new Date()) {
      toast({ variant: "destructive", title: "Error", description: "Scheduled time must be in the future" });
      return;
    }

    try {
      const body: any = {
        status: 'SCHEDULED',
        scheduledFor: scheduledDateTime.toISOString(),
      };
      if (scheduleAccountId) {
        body.socialMediaAccountId = scheduleAccountId;
      }

      const response = await fetch(`/api/content-posts/${schedulingPostId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to schedule post');

      setPosts(posts.map(p =>
        p.id === schedulingPostId
          ? { ...p, status: 'SCHEDULED' as const, scheduledFor: scheduledDateTime.toISOString(), socialMediaAccountId: scheduleAccountId || p.socialMediaAccountId }
          : p
      ));

      toast({ title: "Success", description: `Post scheduled for ${scheduledDateTime.toLocaleString()}` });
      setIsScheduling(false);
      setSchedulingPostId(null);
      setScheduleDate(undefined);
      setScheduleHour(12);
      setScheduleMinute(0);
      setScheduleAccountId("");
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to schedule post" });
    }
  };

  // Fetch post insights
  const fetchPostInsights = async () => {
    try {
      const response = await fetch('/api/insights/post-insights', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setPostInsights(data);
      }
    } catch (error) {
      console.error('Error fetching post insights:', error);
    }
  };

  // Fetch account insights
  const fetchAccountInsights = async (accountId: string) => {
    try {
      const response = await fetch(`/api/insights/account-insights?accountId=${accountId}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setAccountInsights(data);
      }
    } catch (error) {
      console.error('Error fetching account insights:', error);
    }
  };

  // Manually trigger insights refresh for a post
  const refreshPostInsights = async (postId: string) => {
    setIsFetchingInsights(true);
    try {
      const response = await fetch('/api/insights/post-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch insights');
      }

      toast({ title: "Success", description: "Post insights updated" });
      fetchPostInsights();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to fetch insights" });
    } finally {
      setIsFetchingInsights(false);
    }
  };

  // Manually trigger insights refresh for an account
  const refreshAccountInsights = async (accountId: string) => {
    setIsFetchingInsights(true);
    try {
      const response = await fetch('/api/insights/account-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch insights');
      }

      toast({ title: "Success", description: "Account insights updated" });
      fetchAccountInsights(accountId);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to fetch insights" });
    } finally {
      setIsFetchingInsights(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-background flex-col">
        <header className="border-b">
          <div className="container flex h-16 items-center justify-between py-4">
            <h1 className="text-2xl font-bold">InstaCreate Dashboard</h1>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => router.push('/settings')}
                variant="outline"
                size="sm"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button
                onClick={() => {
                  signOut();
                }}
                variant="ghost"
                size="sm"
              >
                Log Out
              </Button>
            </div>
          </div>
        </header>
        
        <main className="flex-1 container py-6">
          <Tabs defaultValue="accounts">
            <TabsList className="mb-6">
              <TabsTrigger value="accounts">Social Media Accounts</TabsTrigger>
              <TabsTrigger value="content">Content Creation</TabsTrigger>
              <TabsTrigger value="insights">Instagram Insights</TabsTrigger>
              <TabsTrigger value="wordpress">WordPress Blog</TabsTrigger>
              <TabsTrigger value="logging">Logging</TabsTrigger>
            </TabsList>
            
            <TabsContent value="accounts">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Your Social Media Accounts</h2>
                <Dialog open={isAddingAccount} onOpenChange={setIsAddingAccount}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" /> Add Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Social Media Account</DialogTitle>
                      <DialogDescription>
                        Connect your social media account using OAuth for secure authentication.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="account-type">Type of Account</Label>
                        <select
                          id="account-type"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={newAccount.accountType}
                          onChange={(e) => setNewAccount({...newAccount, accountType: e.target.value as "INSTAGRAM" | "BLUESKY" | "X"})}
                        >
                          <option value="INSTAGRAM">Instagram</option>
                          <option value="BLUESKY">Bluesky</option>
                          <option value="X">X</option>
                        </select>
                      </div>

                      {newAccount.accountType === "INSTAGRAM" && (
                        <div className="grid gap-3 p-4 border rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Instagram className="h-5 w-5 text-pink-500" />
                            <span className="font-medium">Instagram OAuth</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Connect your Instagram account securely using OAuth. Your access token will be encrypted and automatically refreshed.
                          </p>
                          <Button
                            onClick={() => {
                              window.location.href = '/api/auth/instagram/connect?returnUrl=/dashboard';
                            }}
                            className="w-full"
                          >
                            <Instagram className="h-4 w-4 mr-2" />
                            Connect with Instagram
                          </Button>
                          <p className="text-xs text-muted-foreground text-center">
                            Secure OAuth 2.0 authentication
                          </p>
                        </div>
                      )}

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">
                            Or add manually
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="username">Username</Label>
                        <Input
                          id="username"
                          value={newAccount.username}
                          onChange={(e) => setNewAccount({...newAccount, username: e.target.value})}
                          placeholder="your_username"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="token">Access Token</Label>
                        <Input
                          id="token"
                          type="password"
                          value={newAccount.accessToken}
                          onChange={(e) => setNewAccount({...newAccount, accessToken: e.target.value})}
                          placeholder="Your API access token"
                        />
                        <p className="text-sm text-muted-foreground">
                          Manual token entry (not recommended for Instagram). Use OAuth above for better security.
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddingAccount(false)}>Cancel</Button>
                      <Button onClick={handleAddAccount}>Add Manually</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              
              {isLoading ? (
                <div className="flex justify-center items-center h-64">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : accounts.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {accounts.map((account) => (
                    <Card key={account.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center">
                          {account.accountType === "INSTAGRAM" && <Instagram className="h-5 w-5 mr-2 text-pink-500" />}
                          {account.accountType === "BLUESKY" && <svg className="h-5 w-5 mr-2 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"/><path d="M13 7h-2v6h6v-2h-4z"/></svg>}
                          {account.accountType === "X" && <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
                          {account.username}
                        </CardTitle>
                        <CardDescription>
                          {account.accountType === "INSTAGRAM" ? "Instagram" : 
                           account.accountType === "BLUESKY" ? "Bluesky" : "X"}
                        </CardDescription>
                      </CardHeader>
                      <CardFooter className="flex justify-between">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Social Media Account</DialogTitle>
                              <DialogDescription>
                                Update your social media account details.
                              </DialogDescription>
                            </DialogHeader>
                            <EditAccountForm account={account} onSuccess={() => {
                              // Refresh accounts after successful update
                              fetch('/api/social-media-accounts', { credentials: 'include' })
                                .then(res => res.json())
                                .then(data => setAccounts(data))
                                .catch(err => console.error('Failed to refresh accounts:', err));
                            }} />
                          </DialogContent>
                        </Dialog>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4 mr-2" /> Remove
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the {account.accountType === "INSTAGRAM" ? "Instagram" : 
                                account.accountType === "BLUESKY" ? "Bluesky" : "X"} account "{account.username}" from your dashboard.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  try {
                                    const response = await fetch(`/api/social-media-accounts/${account.id}`, {
                                      method: 'DELETE',
                                      credentials: 'include',
                                    });
                                    
                                    if (!response.ok) {
                                      throw new Error('Failed to delete account');
                                    }
                                    
                                    // Remove the account from the state
                                    setAccounts(accounts.filter(a => a.id !== account.id));
                                    
                                    toast({
                                      title: "Success",
                                      description: `${account.accountType === "INSTAGRAM" ? "Instagram" : 
                                      account.accountType === "BLUESKY" ? "Bluesky" : "X"} account "${account.username}" has been removed`,
                                    });
                                  } catch (error) {
                                    toast({
                                      variant: "destructive",
                                      title: "Error",
                                      description: error instanceof Error ? error.message : "Failed to remove social media account",
                                    });
                                  }
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>No Social Media Accounts</CardTitle>
                    <CardDescription>
                      Add your first social media account to start creating content.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => setIsAddingAccount(true)}>
                      <Plus className="mr-2 h-4 w-4" /> Add Account
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            <TabsContent value="content">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Content Creation</h2>
                <div className="flex gap-2">
                  <Dialog open={isGeneratingContent} onOpenChange={setIsGeneratingContent}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <RefreshCw className="mr-2 h-4 w-4" /> AI Generate
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
                      <DialogHeader>
                        <DialogTitle>Generate Instagram Content with AI</DialogTitle>
                        <DialogDescription>
                          Use AI to generate captions and images for your Instagram posts.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <AIContentGenerator 
                          instagramAccounts={accounts} 
                          onGeneratedContent={handleGeneratedContent} 
                        />
                      </div>
                      <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setIsGeneratingContent(false)}>Cancel</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  
                  <Dialog open={isCreatingPost} onOpenChange={setIsCreatingPost}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" /> Create New Post
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[525px] max-h-[90vh]">
                      <DialogHeader>
                        <DialogTitle>Create Instagram Post</DialogTitle>
                        <DialogDescription>
                          Craft your post content and optionally use AI to enhance it.
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="max-h-[60vh] pr-4">
                        <div className="grid gap-4 py-4">
                          {/* Content Type Selection */}
                          <div className="grid gap-2">
                            <Label htmlFor="content-type">Content Type</Label>
                            <RadioGroup 
                              value={newPost.contentType} 
                              onValueChange={(value) => setNewPost({...newPost, contentType: value})}
                              className="flex flex-wrap gap-4"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="IMAGE" id="create-image-type" />
                                <Label htmlFor="create-image-type">Image</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="VIDEO" id="create-video-type" />
                                <Label htmlFor="create-video-type">Video</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="BLOG_POST" id="create-blog-type" />
                                <Label htmlFor="create-blog-type">Blog Post</Label>
                              </div>
                            </RadioGroup>
                          </div>

                          {/* Video Type Selection - Only show when VIDEO is selected */}
                          {newPost.contentType === 'VIDEO' && (
                            <div className="grid gap-2">
                              <Label htmlFor="video-type">Video Type</Label>
                              <RadioGroup
                                value={newPost.videoType}
                                onValueChange={(value) => setNewPost({...newPost, videoType: value as "FEED" | "REELS"})}
                                className="flex flex-wrap gap-4"
                              >
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="FEED" id="video-feed-type" />
                                  <Label htmlFor="video-feed-type" className="cursor-pointer">
                                    Feed Video
                                    <span className="text-xs text-muted-foreground block">Square/landscape, up to 60 min</span>
                                  </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="REELS" id="video-reels-type" />
                                  <Label htmlFor="video-reels-type" className="cursor-pointer">
                                    Reels
                                    <span className="text-xs text-muted-foreground block">Vertical (9:16), 3-90 seconds</span>
                                  </Label>
                                </div>
                              </RadioGroup>
                            </div>
                          )}

                          <div className="grid gap-2">
                            <Label htmlFor="caption">Caption</Label>
                            <Textarea
                              id="caption"
                              value={newPost.caption}
                              onChange={(e) => setNewPost({...newPost, caption: e.target.value})}
                              placeholder="Write your post caption here..."
                              className="min-h-[100px]"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground mt-1">
                              <span className={newPost.caption.length > 2200 ? 'text-destructive font-medium' : ''}>
                                {newPost.caption.length}/2,200 characters
                              </span>
                              <span className={(newPost.caption.match(/#\w+/g) || []).length > 30 ? 'text-destructive font-medium' : ''}>
                                {(newPost.caption.match(/#\w+/g) || []).length}/30 hashtags
                              </span>
                            </div>
                            <Button 
                              variant="outline" 
                              className="mt-2"
                              onClick={() => {
                                setIsCreatingPost(false);
                                setIsGeneratingContent(true);
                              }}
                            >
                              Generate with AI
                            </Button>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="imageUrl">Image</Label>
                            <Tabs defaultValue="url" className="w-full">
                              <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="url">URL</TabsTrigger>
                                <TabsTrigger value="upload">Upload</TabsTrigger>
                              </TabsList>
                              <TabsContent value="url">
                                <Input
                                  id="imageUrl"
                                  value={newPost.imageUrl}
                                  onChange={(e) => setNewPost({...newPost, imageUrl: e.target.value})}
                                  placeholder="https://example.com/your-image.jpg"
                                  className="mt-2"
                                />
                              </TabsContent>
                              <TabsContent value="upload">
                                <div className="mt-2">
                                  <Input
                                    id="imageFile"
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        // Create a URL for the selected file
                                        const fileUrl = URL.createObjectURL(file);
                                        setNewPost({...newPost, imageUrl: fileUrl, imageFile: file});
                                      }
                                    }}
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Select an image file from your device
                                  </p>
                                </div>
                              </TabsContent>
                            </Tabs>
                            {newPost.imageUrl && (
                              <div className="mt-2 aspect-square relative rounded-md overflow-hidden border">
                                <img 
                                  src={newPost.imageUrl} 
                                  alt="Post preview" 
                                  className="object-cover w-full h-full"
                                />
                              </div>
                            )}
                          </div>
                          
                          <div className="grid gap-2">
                            <Label htmlFor="scheduledFor">Schedule Post (Optional)</Label>
                            <div className="flex flex-col space-y-2">
                              <div className="flex gap-2">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className="flex-1 justify-start text-left font-normal"
                                    >
                                      <Calendar className="mr-2 h-4 w-4" />
                                      {newPost.scheduledFor ?
                                        format(new Date(newPost.scheduledFor), 'PPP') :
                                        "Pick a date"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0">
                                    <CalendarComponent
                                      mode="single"
                                      selected={newPost.scheduledFor ? new Date(newPost.scheduledFor) : undefined}
                                      onSelect={(date) => {
                                        if (date) {
                                          // Preserve the time if already set, otherwise set to 9 AM
                                          if (newPost.scheduledFor) {
                                            const currentDate = new Date(newPost.scheduledFor);
                                            date.setHours(currentDate.getHours());
                                            date.setMinutes(currentDate.getMinutes());
                                          } else {
                                            date.setHours(9);
                                            date.setMinutes(0);
                                          }
                                          setNewPost({...newPost, scheduledFor: date.toISOString()});
                                        }
                                      }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                {newPost.scheduledFor && (
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setNewPost({...newPost, scheduledFor: null})}
                                    title="Clear schedule"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              <div className="flex space-x-2">
                                <select
                                  className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  value={newPost.scheduledFor ? new Date(newPost.scheduledFor).getHours() : ''}
                                  disabled={!newPost.scheduledFor}
                                  onChange={(e) => {
                                    if (!newPost.scheduledFor) return;
                                    const hours = parseInt(e.target.value);
                                    const date = new Date(newPost.scheduledFor);
                                    date.setHours(hours);
                                    setNewPost({...newPost, scheduledFor: date.toISOString()});
                                  }}
                                >
                                  <option value="">HH</option>
                                  {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>
                                      {i.toString().padStart(2, '0')}
                                    </option>
                                  ))}
                                </select>
                                <span className="flex items-center">:</span>
                                <select
                                  className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  value={newPost.scheduledFor ? new Date(newPost.scheduledFor).getMinutes() : ''}
                                  disabled={!newPost.scheduledFor}
                                  onChange={(e) => {
                                    if (!newPost.scheduledFor) return;
                                    const minutes = parseInt(e.target.value);
                                    const date = new Date(newPost.scheduledFor);
                                    date.setMinutes(minutes);
                                    setNewPost({...newPost, scheduledFor: date.toISOString()});
                                  }}
                                >
                                  <option value="">MM</option>
                                  {Array.from({ length: 60 }, (_, i) => (
                                    <option key={i} value={i}>
                                      {i.toString().padStart(2, '0')}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                          {accounts.length > 0 && (
                            <div className="grid gap-2">
                              <Label htmlFor="account">Instagram Account</Label>
                              <select
                                id="account"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={newPost.socialMediaAccountId}
                                onChange={(e) => setNewPost({...newPost, socialMediaAccountId: e.target.value})}
                              >
                                <option value="">Select an account</option>
                                {accounts.map((account) => (
                                  <option key={account.id} value={account.id}>
                                    {account.username}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                      {/* AI Caption Review */}
                      {captionReview && (
                        <div className="rounded-lg border bg-muted/50 p-3 mt-2">
                          <h4 className="font-medium text-sm mb-1">AI Review</h4>
                          <p className="text-sm text-muted-foreground mb-2">{captionReview.recommendations}</p>
                          {captionReview.suggestedCaption && (
                            <div className="mt-2">
                              <p className="text-xs font-medium mb-1">Suggested caption:</p>
                              <p className="text-sm bg-background rounded p-2 border">{captionReview.suggestedCaption}</p>
                              <Button variant="outline" size="sm" className="mt-2" onClick={() => {
                                setNewPost({ ...newPost, caption: captionReview.suggestedCaption });
                                setCaptionReview(null);
                              }}>
                                Use Suggested Caption
                              </Button>
                            </div>
                          )}
                          {captionReview.suggestedHashtags?.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-medium mb-1">Suggested hashtags:</p>
                              <div className="flex flex-wrap gap-1">
                                {captionReview.suggestedHashtags.map((tag: string, i: number) => (
                                  <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded cursor-pointer" onClick={() => {
                                    setNewPost({ ...newPost, caption: newPost.caption + ' ' + tag });
                                  }}>{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setIsCreatingPost(false)}>Cancel</Button>
                        <Button
                          variant="outline"
                          onClick={() => reviewCaption(newPost.caption)}
                          disabled={isReviewingCaption || !newPost.caption}
                        >
                          {isReviewingCaption ? <><RefreshCw className="h-4 w-4 animate-spin mr-1" />Reviewing...</> : "AI Review"}
                        </Button>
                        <Button variant="outline" onClick={() => handleCreatePost(true)}>Save to Drafts</Button>
                        <Button onClick={() => handleCreatePost(false)}>Create Post</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              
              <Tabs defaultValue="all" className="mt-6">
                <TabsList>
                  <TabsTrigger value="all">All Posts</TabsTrigger>
                  <TabsTrigger value="drafts">Drafts</TabsTrigger>
                  <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
                  <TabsTrigger value="published">Published</TabsTrigger>
                  <TabsTrigger value="calendar">Calendar View</TabsTrigger>
                </TabsList>
                
                <TabsContent value="all">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : posts.length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2">
                      {posts.map((post) => (
                    <Card key={post.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center">
                          <div className="flex-1 truncate">{post.caption.substring(0, 30)}...</div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              post.contentType === 'IMAGE' ? 'bg-purple-100 text-purple-800' :
                              post.contentType === 'VIDEO' ? 'bg-blue-100 text-blue-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {post.contentType.replace('_', ' ')}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              post.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-800' :
                              post.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                              post.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {post.status}
                            </span>
                          </div>
                        </CardTitle>
                        {post.scheduledFor && (
                          <CardDescription className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            {new Date(post.scheduledFor).toLocaleString()}
                          </CardDescription>
                        )}
                        {post.status === 'FAILED' && post.errorMessage && (
                          <CardDescription className="text-destructive text-xs mt-1">
                            Error: {post.errorMessage}
                            {post.retryCount ? ` (${post.retryCount} retries)` : ''}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        {post.imageUrl && (
                          <div className="aspect-square relative mb-4 rounded-md overflow-hidden">
                            <img
                              src={post.imageUrl}
                              alt="Post image"
                              className="object-cover w-full h-full"
                              onError={(e) => {
                                // If image fails to load, show placeholder
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center', 'bg-muted');
                                const icon = document.createElement('div');
                                icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8 text-muted-foreground"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>';
                                e.currentTarget.parentElement?.appendChild(icon);
                              }}
                            />
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground line-clamp-3">{post.caption}</p>
                      </CardContent>
                      <CardFooter className="flex flex-col gap-2">
                        <div className="flex justify-between w-full">
                          <Button variant="outline" size="sm">
                            <Edit className="h-4 w-4 mr-2" /> Edit
                          </Button>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </Button>
                        </div>
                        
                        {post.status === 'DRAFT' && (
                          <div className="flex gap-2 w-full mt-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button className="flex-1" size="sm">
                                  Post Now
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Post to Social Media</DialogTitle>
                                  <DialogDescription>
                                    Select a social media account to post this content to.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                  {accounts.length > 0 ? (
                                    <div className="grid gap-4">
                                      <div className="grid gap-2">
                                        <Label htmlFor="post-account">Social Media Account</Label>
                                        <select
                                          id="post-account"
                                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                          defaultValue={post.socialMediaAccountId || ""}
                                        >
                                          <option value="" disabled>Select an account</option>
                                          {accounts.map((account) => (
                                            <option key={account.id} value={account.id}>
                                              {account.username} ({account.accountType === "INSTAGRAM" ? "Instagram" : 
                                               account.accountType === "BLUESKY" ? "Bluesky" : "X"})
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="mt-2">
                                        <div className="rounded-md bg-muted p-4">
                                          <div className="font-medium">Post Preview</div>
                                          {post.imageUrl && (
                                            <div className="mt-2 aspect-square relative rounded-md overflow-hidden border max-w-[200px]">
                                              <img 
                                                src={post.imageUrl} 
                                                alt="Post preview" 
                                                className="object-cover w-full h-full"
                                              />
                                            </div>
                                          )}
                                          <p className="mt-2 text-sm">{post.caption}</p>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-center py-4">
                                      <p className="text-muted-foreground">You need to add a social media account first.</p>
                                      <Button 
                                        variant="outline" 
                                        className="mt-2"
                                        onClick={() => {
                                          setIsAddingAccount(true);
                                        }}
                                      >
                                        Add Social Media Account
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                <DialogFooter>
                                  <Button 
                                    variant="outline" 
                                    onClick={(e) => {
                                      const dialogContent = (e.target as HTMLElement).closest('div[role="dialog"]');
                                      if (dialogContent) {
                                        const closeButton = dialogContent.querySelector('button[aria-label="Close"]');
                                        if (closeButton) {
                                          (closeButton as HTMLButtonElement).click();
                                        }
                                      }
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={async (e) => {
                                      const dialogContent = (e.target as HTMLElement).closest('div[role="dialog"]');
                                      if (!dialogContent) return;
                                      
                                      const select = dialogContent.querySelector('select#post-account') as HTMLSelectElement;
                                      const accountId = select?.value;
                                      
                                      if (!accountId) {
                                        toast({
                                          variant: "destructive",
                                          title: "Error",
                                          description: "Please select a social media account",
                                        });
                                        return;
                                      }
                                      
                                      try {
                                        const response = await fetch(`/api/social-media-accounts/${accountId}/post`, {
                                          method: 'POST',
                                          headers: {
                                            'Content-Type': 'application/json',
                                          },
                                          body: JSON.stringify({
                                            postId: post.id,
                                          }),
                                          credentials: 'include',
                                        });
                                        
                                        if (!response.ok) {
                                          const errorData = await response.json();
                                          throw new Error(errorData.error || errorData.details || 'Failed to post to social media');
                                        }
                                        
                                        const result = await response.json();

                                        // Update the post in the local state
                                        setPosts(posts.map(p =>
                                          p.id === post.id
                                            ? {...p, status: 'PUBLISHED' as const, socialMediaAccountId: accountId, igMediaId: result.postResult?.mediaId || null}
                                            : p
                                        ));

                                        toast({
                                          title: "Posted Successfully",
                                          description: result.message || "Content posted successfully",
                                        });

                                        // Close the dialog
                                        const closeButton = dialogContent.querySelector('button[aria-label="Close"]');
                                        if (closeButton) {
                                          (closeButton as HTMLButtonElement).click();
                                        }
                                      } catch (error) {
                                        console.error('Error posting to social media:', error);
                                        toast({
                                          variant: "destructive",
                                          title: "Posting Failed",
                                          description: error instanceof Error ? error.message : "Failed to post to social media",
                                        });

                                        // Update the post status to FAILED in the local state
                                        setPosts(posts.map(p =>
                                          p.id === post.id
                                            ? {...p, status: 'FAILED' as const}
                                            : p
                                        ));
                                      }
                                    }}
                                  >
                                    Post to Social Media
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <Button
                              variant="outline"
                              className="flex-1"
                              size="sm"
                              onClick={() => {
                                setSchedulingPostId(post.id);
                                setScheduleAccountId(post.socialMediaAccountId || "");
                                setScheduleDate(undefined);
                                setScheduleHour(12);
                                setScheduleMinute(0);
                                setIsScheduling(true);
                              }}
                            >
                              Schedule
                            </Button>
                          </div>
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>No Content Posts</CardTitle>
                    <CardDescription>
                      Create your first Instagram post to get started.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => setIsCreatingPost(true)}>
                      <Plus className="mr-2 h-4 w-4" /> Create New Post
                    </Button>
                  </CardContent>
                </Card>
              )}
                </TabsContent>
                
                <TabsContent value="drafts">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : posts.filter(post => post.status === 'DRAFT').length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2">
                      {posts.filter(post => post.status === 'DRAFT').map((post) => (
                        <Card key={post.id}>
                          <CardHeader>
                            <CardTitle className="flex items-center">
                              <div className="flex-1 truncate">{post.caption.substring(0, 30)}...</div>
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  post.contentType === 'IMAGE' ? 'bg-purple-100 text-purple-800' :
                                  post.contentType === 'VIDEO' ? 'bg-blue-100 text-blue-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {post.contentType.replace('_', ' ')}
                                </span>
                                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">
                                  {post.status}
                                </span>
                              </div>
                            </CardTitle>
                            {post.scheduledFor && (
                              <CardDescription className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1" />
                                {new Date(post.scheduledFor).toLocaleString()}
                              </CardDescription>
                            )}
                          </CardHeader>
                          <CardContent>
                            {post.imageUrl && (
                              <div className="aspect-square relative mb-4 rounded-md overflow-hidden">
                                <img 
                                  src={post.imageUrl} 
                                  alt="Post image" 
                                  className="object-cover w-full h-full"
                                  onError={(e) => {
                                    // If image fails to load, show placeholder
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center', 'bg-muted');
                                    const icon = document.createElement('div');
                                    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8 text-muted-foreground"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>';
                                    e.currentTarget.parentElement?.appendChild(icon);
                                  }}
                                />
                              </div>
                            )}
                            <p className="text-sm text-muted-foreground line-clamp-3">{post.caption}</p>
                          </CardContent>
                          <CardFooter className="flex flex-col gap-2">
                            <div className="flex justify-between w-full">
                              <Button variant="outline" size="sm" onClick={() => {
                                // Set the post data for editing
                                setNewPost({
                                  caption: post.caption,
                                  imageUrl: post.imageUrl || "",
                                  imageFile: null,
                                  socialMediaAccountId: post.socialMediaAccountId || "",
                                  contentType: post.contentType,
                                  scheduledFor: post.scheduledFor || null
                                });
                                setIsCreatingPost(true);
                              }}>
                                <Edit className="h-4 w-4 mr-2" /> Edit
                              </Button>
                              <Button variant="destructive" size="sm" onClick={async () => {
                                try {
                                  const response = await fetch(`/api/content-posts/${post.id}`, {
                                    method: 'DELETE',
                                    credentials: 'include',
                                  });
                                  
                                  if (!response.ok) {
                                    throw new Error('Failed to delete post');
                                  }
                                  
                                  // Remove the post from the state
                                  setPosts(posts.filter(p => p.id !== post.id));
                                  
                                  toast({
                                    title: "Success",
                                    description: "Post deleted successfully",
                                  });
                                } catch (error) {
                                  toast({
                                    variant: "destructive",
                                    title: "Error",
                                    description: error instanceof Error ? error.message : "Failed to delete post",
                                  });
                                }
                              }}>
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </Button>
                            </div>
                            
                            <div className="flex gap-2 w-full mt-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button className="flex-1" size="sm">
                                    Post Now
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Post to Social Media</DialogTitle>
                                    <DialogDescription>
                                      Select a social media account to post this content to.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="py-4">
                                    {accounts.length > 0 ? (
                                      <div className="grid gap-4">
                                        <div className="grid gap-2">
                                          <Label htmlFor="post-account">Social Media Account</Label>
                                          <select
                                            id="post-account"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            defaultValue={post.socialMediaAccountId || ""}
                                          >
                                            <option value="" disabled>Select an account</option>
                                            {accounts.map((account) => (
                                              <option key={account.id} value={account.id}>
                                                {account.username} ({account.accountType === "INSTAGRAM" ? "Instagram" : 
                                                 account.accountType === "BLUESKY" ? "Bluesky" : "X"})
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="mt-2">
                                          <div className="rounded-md bg-muted p-4">
                                            <div className="font-medium">Post Preview</div>
                                            {post.imageUrl && (
                                              <div className="mt-2 aspect-square relative rounded-md overflow-hidden border max-w-[200px]">
                                                <img 
                                                  src={post.imageUrl} 
                                                  alt="Post preview" 
                                                  className="object-cover w-full h-full"
                                                />
                                              </div>
                                            )}
                                            <p className="mt-2 text-sm">{post.caption}</p>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-center py-4">
                                        <p className="text-muted-foreground">You need to add a social media account first.</p>
                                        <Button 
                                          variant="outline" 
                                          className="mt-2"
                                          onClick={() => {
                                            setIsAddingAccount(true);
                                          }}
                                        >
                                          Add Social Media Account
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <DialogFooter>
                                    <Button 
                                      variant="outline" 
                                      onClick={(e) => {
                                        const dialogContent = (e.target as HTMLElement).closest('div[role="dialog"]');
                                        if (dialogContent) {
                                          const closeButton = dialogContent.querySelector('button[aria-label="Close"]');
                                          if (closeButton) {
                                            (closeButton as HTMLButtonElement).click();
                                          }
                                        }
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      onClick={async (e) => {
                                        const dialogContent = (e.target as HTMLElement).closest('div[role="dialog"]');
                                        if (!dialogContent) return;
                                        
                                        const select = dialogContent.querySelector('select#post-account') as HTMLSelectElement;
                                        const accountId = select?.value;
                                        
                                        if (!accountId) {
                                          toast({
                                            variant: "destructive",
                                            title: "Error",
                                            description: "Please select a social media account",
                                          });
                                          return;
                                        }
                                        
                                        try {
                                          const response = await fetch(`/api/social-media-accounts/${accountId}/post`, {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                              postId: post.id,
                                            }),
                                            credentials: 'include',
                                          });
                                          
                                          if (!response.ok) {
                                            const errorData = await response.json();
                                            throw new Error(errorData.error || errorData.details || 'Failed to post to social media');
                                          }
                                          
                                          const result = await response.json();

                                          // Update the post in the local state
                                          setPosts(posts.map(p =>
                                            p.id === post.id
                                              ? {...p, status: 'PUBLISHED' as const, socialMediaAccountId: accountId, igMediaId: result.postResult?.mediaId || null}
                                              : p
                                          ));

                                          toast({
                                            title: "Posted Successfully",
                                            description: result.message || "Content posted successfully",
                                          });

                                          // Close the dialog
                                          const closeButton = dialogContent.querySelector('button[aria-label="Close"]');
                                          if (closeButton) {
                                            (closeButton as HTMLButtonElement).click();
                                          }
                                        } catch (error) {
                                          console.error('Error posting to social media:', error);
                                          toast({
                                            variant: "destructive",
                                            title: "Posting Failed",
                                            description: error instanceof Error ? error.message : "Failed to post to social media",
                                          });

                                          // Update the post status to FAILED in the local state
                                          setPosts(posts.map(p =>
                                            p.id === post.id
                                              ? {...p, status: 'FAILED' as const}
                                              : p
                                          ));
                                        }
                                      }}
                                    >
                                      Post to Social Media
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                              <Button 
                                variant="outline" 
                                className="flex-1" 
                                size="sm"
                                onClick={() => {
                                  setSchedulingPostId(post.id);
                                  setScheduleAccountId(post.socialMediaAccountId || "");
                                  setScheduleDate(undefined);
                                  setScheduleHour(12);
                                  setScheduleMinute(0);
                                  setIsScheduling(true);
                                }}
                              >
                                Schedule
                              </Button>
                            </div>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>No Draft Posts</CardTitle>
                        <CardDescription>
                          Save posts as drafts to edit them later before posting.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button onClick={() => setIsCreatingPost(true)}>
                          <Plus className="mr-2 h-4 w-4" /> Create New Post
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="scheduled">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : posts.filter(post => post.status === 'SCHEDULED').length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2">
                      {posts.filter(post => post.status === 'SCHEDULED').map((post) => {
                        const scheduledDate = post.scheduledFor ? new Date(post.scheduledFor) : null;
                        const now = new Date();
                        const timeUntil = scheduledDate ? scheduledDate.getTime() - now.getTime() : 0;
                        const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
                        const minutesUntil = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
                        const isPastDue = timeUntil < 0;

                        return (
                        <Card key={post.id}>
                          <CardHeader>
                            <CardTitle className="flex items-center">
                              <div className="flex-1 truncate">{post.caption.substring(0, 30)}...</div>
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  post.contentType === 'IMAGE' ? 'bg-purple-100 text-purple-800' :
                                  post.contentType === 'VIDEO' ? 'bg-blue-100 text-blue-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {post.contentType.replace('_', ' ')}
                                </span>
                                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                                  SCHEDULED
                                </span>
                              </div>
                            </CardTitle>
                            {scheduledDate && (
                              <CardDescription>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  {scheduledDate.toLocaleString()}
                                </div>
                                {isPastDue ? (
                                  <div className="text-orange-600 text-sm mt-1">
                                    Post is due - will publish shortly
                                  </div>
                                ) : (
                                  <div className="text-blue-600 text-sm mt-1">
                                    {hoursUntil > 0 && `${hoursUntil}h `}
                                    {minutesUntil}m until posting
                                  </div>
                                )}
                              </CardDescription>
                            )}
                          </CardHeader>
                          <CardContent>
                            {post.imageUrl && (
                              <div className="aspect-square relative mb-4 rounded-md overflow-hidden">
                                <img
                                  src={post.imageUrl}
                                  alt="Post image"
                                  className="object-cover w-full h-full"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center', 'bg-muted');
                                    const icon = document.createElement('div');
                                    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8 text-muted-foreground"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>';
                                    e.currentTarget.parentElement?.appendChild(icon);
                                  }}
                                />
                              </div>
                            )}
                            <p className="text-sm text-muted-foreground line-clamp-3">{post.caption}</p>
                          </CardContent>
                          <CardFooter className="flex flex-col gap-2">
                            <div className="flex gap-2 w-full">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="flex-1">
                                    Cancel Schedule
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Cancel Scheduled Post</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will cancel the scheduled post and move it back to drafts. You can reschedule it later.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Keep Schedule</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={async () => {
                                        try {
                                          const response = await fetch(`/api/content-posts/${post.id}`, {
                                            method: 'PUT',
                                            headers: {
                                              'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                              status: 'DRAFT',
                                              scheduledFor: null
                                            }),
                                            credentials: 'include',
                                          });

                                          if (!response.ok) {
                                            throw new Error('Failed to cancel schedule');
                                          }

                                          setPosts(posts.map(p =>
                                            p.id === post.id
                                              ? {...p, status: 'DRAFT', scheduledFor: undefined}
                                              : p
                                          ));

                                          toast({
                                            title: "Success",
                                            description: "Scheduled post cancelled and moved to drafts",
                                          });
                                        } catch (error) {
                                          toast({
                                            variant: "destructive",
                                            title: "Error",
                                            description: error instanceof Error ? error.message : "Failed to cancel schedule",
                                          });
                                        }
                                      }}
                                    >
                                      Cancel Schedule
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm" className="flex-1">
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Post</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone. This will permanently delete the scheduled post.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={async () => {
                                        try {
                                          const response = await fetch(`/api/content-posts/${post.id}`, {
                                            method: 'DELETE',
                                            credentials: 'include',
                                          });

                                          if (!response.ok) {
                                            throw new Error('Failed to delete post');
                                          }

                                          setPosts(posts.filter(p => p.id !== post.id));

                                          toast({
                                            title: "Success",
                                            description: "Post deleted successfully",
                                          });
                                        } catch (error) {
                                          toast({
                                            variant: "destructive",
                                            title: "Error",
                                            description: error instanceof Error ? error.message : "Failed to delete post",
                                          });
                                        }
                                      }}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </CardFooter>
                        </Card>
                      )})}
                    </div>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>No Scheduled Posts</CardTitle>
                        <CardDescription>
                          Schedule posts to automatically publish them at a specific time.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button onClick={() => setIsCreatingPost(true)}>
                          <Plus className="mr-2 h-4 w-4" /> Create New Post
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="published">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : posts.filter(post => post.status === 'PUBLISHED').length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2">
                      {posts.filter(post => post.status === 'PUBLISHED').map((post) => (
                        <Card key={post.id}>
                          <CardHeader>
                            <CardTitle className="flex items-center">
                              <div className="flex-1 truncate">{post.caption.substring(0, 30)}...</div>
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  post.contentType === 'IMAGE' ? 'bg-purple-100 text-purple-800' :
                                  post.contentType === 'VIDEO' ? 'bg-blue-100 text-blue-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {post.contentType.replace('_', ' ')}
                                </span>
                                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                                  PUBLISHED
                                </span>
                              </div>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {post.imageUrl && (
                              <div className="aspect-square relative mb-4 rounded-md overflow-hidden">
                                <img
                                  src={post.imageUrl}
                                  alt="Post image"
                                  className="object-cover w-full h-full"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center', 'bg-muted');
                                    const icon = document.createElement('div');
                                    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8 text-muted-foreground"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>';
                                    e.currentTarget.parentElement?.appendChild(icon);
                                  }}
                                />
                              </div>
                            )}
                            <p className="text-sm text-muted-foreground line-clamp-3">{post.caption}</p>
                          </CardContent>
                          <CardFooter>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Post</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will delete the post record from your dashboard. It will NOT delete the post from the social media platform.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={async () => {
                                      try {
                                        const response = await fetch(`/api/content-posts/${post.id}`, {
                                          method: 'DELETE',
                                          credentials: 'include',
                                        });

                                        if (!response.ok) {
                                          throw new Error('Failed to delete post');
                                        }

                                        setPosts(posts.filter(p => p.id !== post.id));

                                        toast({
                                          title: "Success",
                                          description: "Post deleted from dashboard",
                                        });
                                      } catch (error) {
                                        toast({
                                          variant: "destructive",
                                          title: "Error",
                                          description: error instanceof Error ? error.message : "Failed to delete post",
                                        });
                                      }
                                    }}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>No Published Posts</CardTitle>
                        <CardDescription>
                          Posts you publish will appear here.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button onClick={() => setIsCreatingPost(true)}>
                          <Plus className="mr-2 h-4 w-4" /> Create New Post
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="calendar">
                  <CalendarView
                    posts={posts}
                    onEditPost={(postId) => {
                      // Handle edit post
                      toast({
                        title: "Edit Post",
                        description: "Edit functionality coming soon!",
                      });
                    }}
                    onDeletePost={async (postId) => {
                      if (confirm('Are you sure you want to delete this post?')) {
                        try {
                          const response = await fetch(`/api/content-posts/${postId}`, {
                            method: 'DELETE',
                          });

                          if (!response.ok) {
                            throw new Error('Failed to delete post');
                          }

                          toast({
                            title: "Success",
                            description: "Post deleted successfully",
                          });

                          // Refresh posts
                          fetchPosts();
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to delete post",
                            variant: "destructive",
                          });
                        }
                      }
                    }}
                    onViewPost={(postId) => {
                      // Scroll to the post in the all posts tab
                      const postElement = document.getElementById(`post-${postId}`);
                      if (postElement) {
                        postElement.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                  />
                </TabsContent>
              </Tabs>
            </TabsContent>
            
            <TabsContent value="insights">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Instagram Insights</h2>
                <div className="text-sm text-muted-foreground">
                  Track performance &amp; discover high-performing content
                </div>
              </div>

              {/* Account Insights Section */}
              {accounts.filter(a => a.accountType === 'INSTAGRAM').length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center">
                        <Instagram className="h-5 w-5 mr-2 text-pink-500" />
                        Account Performance
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={selectedInsightsAccountId}
                          onChange={(e) => {
                            setSelectedInsightsAccountId(e.target.value);
                            if (e.target.value) fetchAccountInsights(e.target.value);
                          }}
                        >
                          <option value="">Select account</option>
                          {accounts.filter(a => a.accountType === 'INSTAGRAM').map((account) => (
                            <option key={account.id} value={account.id}>
                              @{account.username}
                            </option>
                          ))}
                        </select>
                        {selectedInsightsAccountId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refreshAccountInsights(selectedInsightsAccountId)}
                            disabled={isFetchingInsights}
                          >
                            {isFetchingInsights ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </CardTitle>
                    <CardDescription>
                      View follower counts, profile views, and engagement metrics for your account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!selectedInsightsAccountId ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Select an account above to view insights.</p>
                    ) : accountInsights.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground mb-2">No insights data yet.</p>
                        <Button variant="outline" size="sm" onClick={() => refreshAccountInsights(selectedInsightsAccountId)} disabled={isFetchingInsights}>
                          {isFetchingInsights ? "Fetching..." : "Fetch Insights Now"}
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {(() => {
                          const latest = accountInsights[0];
                          const prev = accountInsights.length > 1 ? accountInsights[1] : null;
                          const metrics = [
                            { label: 'Followers', value: latest.followers, prev: prev?.followers },
                            { label: 'Following', value: latest.following, prev: prev?.following },
                            { label: 'Posts', value: latest.mediaCount, prev: prev?.mediaCount },
                            { label: 'Profile Views', value: latest.profileViews, prev: prev?.profileViews },
                            { label: 'Website Clicks', value: latest.websiteClicks, prev: prev?.websiteClicks },
                          ];
                          return metrics.map((m) => {
                            const diff = m.prev !== undefined && m.prev !== null ? m.value - m.prev : null;
                            return (
                              <div key={m.label} className="rounded-lg border p-3 text-center">
                                <div className="text-2xl font-bold">{m.value.toLocaleString()}</div>
                                <div className="text-xs text-muted-foreground">{m.label}</div>
                                {diff !== null && diff !== 0 && (
                                  <div className={`text-xs mt-1 ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                    {accountInsights.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Last updated: {new Date(accountInsights[0].fetchedAt).toLocaleString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Post Performance Section */}
              {posts.filter(p => p.status === 'PUBLISHED').length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Post Performance</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchPostInsights}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" /> Load Insights
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      View engagement metrics for your published posts. Click refresh on individual posts to pull latest data from Instagram.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      {posts.filter(p => p.status === 'PUBLISHED').map((post) => {
                        const insight = postInsights.find(i => i.postId === post.id);
                        return (
                          <div key={post.id} className="rounded-lg border p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{post.caption.substring(0, 60)}...</p>
                                {post.socialMediaAccount && (
                                  <p className="text-xs text-muted-foreground">@{post.socialMediaAccount.username}</p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => refreshPostInsights(post.id)}
                                disabled={isFetchingInsights}
                              >
                                <RefreshCw className={`h-3 w-3 ${isFetchingInsights ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>
                            {insight ? (
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                  <div className="text-lg font-bold">{insight.reach.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Reach</div>
                                </div>
                                <div>
                                  <div className="text-lg font-bold">{insight.likes.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Likes</div>
                                </div>
                                <div>
                                  <div className="text-lg font-bold">{insight.comments.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Comments</div>
                                </div>
                                <div>
                                  <div className="text-lg font-bold">{insight.shares.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Shares</div>
                                </div>
                                <div>
                                  <div className="text-lg font-bold">{insight.saves.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Saves</div>
                                </div>
                                <div>
                                  <div className="text-lg font-bold">{insight.engagement.toFixed(1)}%</div>
                                  <div className="text-xs text-muted-foreground">Engagement</div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-2">
                                No insights yet. Click refresh to fetch from Instagram.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI Recommendations Section */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>AI Content Recommendations</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => getRecommendations('general')}
                        disabled={isLoadingRecommendations}
                      >
                        {isLoadingRecommendations ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                        Strategy Tips
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => getRecommendations('hashtag_suggestions')}
                        disabled={isLoadingRecommendations}
                      >
                        Hashtag Ideas
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    Get AI-powered suggestions based on your performance data. The more published posts with insights, the better the recommendations.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!recommendations && !isLoadingRecommendations && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Click "Strategy Tips" or "Hashtag Ideas" to get personalized recommendations based on your content performance.
                    </p>
                  )}
                  {isLoadingRecommendations && (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                      <span className="text-sm text-muted-foreground">Analyzing your content performance...</span>
                    </div>
                  )}
                  {recommendations && (
                    <div className="space-y-4">
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-sm">{recommendations.recommendations}</div>
                      </div>
                      {recommendations.actionItems?.length > 0 && (
                        <div className="rounded-lg bg-muted p-4">
                          <h4 className="font-medium text-sm mb-2">Action Items</h4>
                          <ul className="space-y-1">
                            {recommendations.actionItems.map((item: string, i: number) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <span className="text-green-600 mt-0.5">-</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {recommendations.suggestedHashtags && (
                        <div className="flex flex-wrap gap-1">
                          {recommendations.suggestedHashtags.map((tag: string, i: number) => (
                            <span key={i} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-blue-50 text-blue-700 cursor-pointer" onClick={() => trackHashtag(tag)}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Search Section */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Instagram className="h-5 w-5 mr-2 text-pink-500" />
                    Search Instagram
                  </CardTitle>
                  <CardDescription>
                    Search for hashtags or look up accounts to find high-performing content.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-3">
                    <Button
                      variant={searchType === 'hashtag' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSearchType('hashtag')}
                    >
                      # Hashtag
                    </Button>
                    <Button
                      variant={searchType === 'account' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSearchType('account')}
                    >
                      @ Account
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={searchType === 'hashtag' ? 'Search hashtags (e.g. travel, photography)...' : 'Look up an account (e.g. natgeo)...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => { if (e.key === 'Enter') handleInstagramSearch(); }}
                      className="flex-1"
                    />
                    <Button onClick={handleInstagramSearch} disabled={isSearching}>
                      {isSearching ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Searching...</> : "Search"}
                    </Button>
                  </div>
                  {searchType === 'hashtag' && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Note: Instagram limits hashtag searches to 30 unique hashtags per 7 days per account.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Hashtag Search Results */}
              {searchResults.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">Hashtag Results ({searchResults.length} posts)</h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {searchResults.map((post: any) => (
                      <Card key={post.id}>
                        <CardContent className="pt-4">
                          {post.imageUrl && (
                            <div className="aspect-square relative mb-3 rounded-md overflow-hidden">
                              <img src={post.imageUrl} alt="Post" className="object-cover w-full h-full" />
                            </div>
                          )}
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-muted-foreground">
                              {post.likes.toLocaleString()} likes / {post.comments.toLocaleString()} comments
                            </div>
                            {post.timestamp && <div className="text-xs text-muted-foreground">{new Date(post.timestamp).toLocaleDateString()}</div>}
                          </div>
                          <p className="text-sm line-clamp-3 mb-2">{post.caption}</p>
                          <div className="flex flex-wrap gap-1 mb-3">
                            {(post.hashtags || []).slice(0, 4).map((tag: string, i: number) => (
                              <span key={i} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-blue-50 text-blue-700 cursor-pointer" onClick={() => trackHashtag(tag)}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => saveAsIdea(post)}>
                              Save Idea
                            </Button>
                            <Button size="sm" className="flex-1" onClick={() => setSelectedPost(post)}>
                              Create Content
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Account Search Results */}
              {accountSearchResults.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">Account Results</h3>
                  {accountSearchResults.map((account: any) => (
                    <Card key={account.id} className="mb-4">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {account.profilePicture ? (
                              <img src={account.profilePicture} alt={account.username} className="w-12 h-12 rounded-full" />
                            ) : (
                              <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-orange-500 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold">{(account.username || '?').charAt(0).toUpperCase()}</span>
                              </div>
                            )}
                            <div>
                              <p className="font-semibold">@{account.username}</p>
                              {account.name && <p className="text-sm text-muted-foreground">{account.name}</p>}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => trackCompetitor(account.username)}>
                            Track Account
                          </Button>
                        </div>
                        {account.bio && <p className="text-sm mt-2">{account.bio}</p>}
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-4 text-center mb-4">
                          <div>
                            <div className="text-lg font-bold">{(account.followers || 0).toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">Followers</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold">{(account.following || 0).toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">Following</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold">{(account.mediaCount || 0).toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">Posts</div>
                          </div>
                        </div>
                        {account.recentPosts?.length > 0 && (
                          <>
                            <h4 className="text-sm font-medium mb-2">Recent Posts</h4>
                            <div className="grid grid-cols-3 gap-2">
                              {account.recentPosts.map((post: any) => (
                                <div key={post.id} className="relative group cursor-pointer" onClick={() => saveAsIdea({ ...post, username: account.username })}>
                                  {post.imageUrl ? (
                                    <img src={post.imageUrl} alt="" className="aspect-square object-cover rounded-md w-full" />
                                  ) : (
                                    <div className="aspect-square bg-muted rounded-md flex items-center justify-center">
                                      <Image className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center text-white text-xs">
                                    <div className="text-center">
                                      <div>{(post.likes || 0).toLocaleString()} likes</div>
                                      <div className="mt-1">Click to save</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* No Results */}
              {searchQuery && searchResults.length === 0 && accountSearchResults.length === 0 && !isSearching && (
                <Card className="mb-6">
                  <CardContent className="text-center py-8">
                    <Instagram className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium mb-2">No results found</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchType === 'account' ? 'Account must be a Business or Creator account to be discoverable.' : 'Try a different hashtag.'}
                    </p>
                    <Button variant="outline" onClick={() => { setSearchQuery(""); setSearchResults([]); setAccountSearchResults([]); }}>Clear Search</Button>
                  </CardContent>
                </Card>
              )}

              {/* Saved Content Ideas */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Saved Content Ideas</span>
                    <span className="text-sm font-normal text-muted-foreground">{contentIdeas.length} ideas</span>
                  </CardTitle>
                  <CardDescription>Posts you've saved as inspiration for your own content.</CardDescription>
                </CardHeader>
                <CardContent>
                  {contentIdeas.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No saved ideas yet. Search for content and click "Save Idea" to start building your library.</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {contentIdeas.map((idea: any) => (
                        <div key={idea.id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              {idea.sourceAccountName && <p className="text-xs text-muted-foreground">@{idea.sourceAccountName}</p>}
                              <p className="text-sm line-clamp-2">{idea.sourceCaption || idea.notes || 'No caption'}</p>
                            </div>
                            <select
                              className="h-7 rounded border text-xs ml-2"
                              value={idea.status}
                              onChange={(e) => updateIdeaStatus(idea.id, e.target.value)}
                            >
                              <option value="NEW">New</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="USED">Used</option>
                              <option value="ARCHIVED">Archived</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1">
                              {(idea.tags || []).slice(0, 3).map((tag: string, i: number) => (
                                <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{tag}</span>
                              ))}
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => {
                                setSelectedPost({
                                  username: idea.sourceAccountName || '',
                                  caption: idea.sourceCaption || '',
                                  imageUrl: idea.sourceImageUrl || '',
                                  likes: idea.sourceLikes || 0,
                                  comments: idea.sourceComments || 0,
                                  hashtags: idea.tags || [],
                                });
                              }}>
                                Create
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => deleteIdea(idea.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tracked Hashtags & Competitors */}
              <div className="grid gap-6 md:grid-cols-2 mb-6">
                {/* Tracked Hashtags */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tracked Hashtags</CardTitle>
                    <CardDescription>Hashtags you're monitoring. Click a hashtag from search results to track it.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {trackedHashtags.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">No tracked hashtags yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {trackedHashtags.map((th: any) => (
                          <span key={th.id} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm bg-blue-50 text-blue-700">
                            #{th.hashtag}
                            {th.postCount && <span className="text-xs text-blue-500">({th.postCount.toLocaleString()})</span>}
                            <button
                              className="ml-1 text-blue-400 hover:text-red-500"
                              onClick={() => untrackHashtag(th.id)}
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Input
                        placeholder="Add hashtag..."
                        className="h-8 text-sm"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement;
                            if (input.value.trim()) { trackHashtag(input.value.trim()); input.value = ''; }
                          }
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Tracked Competitors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tracked Competitors</CardTitle>
                    <CardDescription>Accounts you're monitoring for content strategy.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {trackedCompetitors.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">No tracked competitors yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {trackedCompetitors.map((comp: any) => (
                          <div key={comp.id} className="flex items-center justify-between rounded-lg border p-2">
                            <div>
                              <p className="font-medium text-sm">@{comp.username}</p>
                              <div className="flex gap-3 text-xs text-muted-foreground">
                                {comp.followerCount != null && <span>{comp.followerCount.toLocaleString()} followers</span>}
                                {comp.mediaCount != null && <span>{comp.mediaCount.toLocaleString()} posts</span>}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => refreshCompetitor(comp.id)}>
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setSearchType('account'); setSearchQuery(comp.username); handleInstagramSearch(); }}>
                                View
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => untrackCompetitor(comp.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Input
                        placeholder="Add @username..."
                        className="h-8 text-sm"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement;
                            if (input.value.trim()) { trackCompetitor(input.value.trim()); input.value = ''; }
                          }
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Inspiration Dialog */}
              <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
                  <DialogHeader>
                    <DialogTitle>Create Inspired Content</DialogTitle>
                    <DialogDescription>
                      Generate similar content based on this high-performing post
                    </DialogDescription>
                  </DialogHeader>
                  {selectedPost && (
                    <ScrollArea className="max-h-[60vh] pr-4">
                      <div className="grid gap-4 py-4">
                        {/* Original Post Preview */}
                        <div className="rounded-md bg-muted p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-orange-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">
                                {selectedPost.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">@{selectedPost.username}</p>
                              <p className="text-xs text-muted-foreground">
                                {selectedPost.likes.toLocaleString()} likes • {selectedPost.comments.toLocaleString()} comments
                              </p>
                            </div>
                          </div>
                          {selectedPost.imageUrl && (
                            <div className="aspect-square relative mb-3 rounded-md overflow-hidden max-w-[200px]">
                              <img 
                                src={selectedPost.imageUrl} 
                                alt="Original post" 
                                className="object-cover w-full h-full"
                              />
                            </div>
                          )}
                          <p className="text-sm mb-2">{selectedPost.caption}</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedPost.hashtags.slice(0, 5).map((hashtag: string, index: number) => (
                              <span key={index} className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700">
                                {hashtag}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Custom Prompt */}
                        <div className="grid gap-2">
                          <Label htmlFor="custom-prompt">Custom Instructions (Optional)</Label>
                          <Textarea
                            id="custom-prompt"
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="Add specific instructions for the AI, like your brand voice, target audience, or specific elements to include..."
                            className="min-h-[80px]"
                          />
                          <p className="text-xs text-muted-foreground">
                            Example: "Make it more casual and fun, target young professionals, include a call-to-action"
                          </p>
                        </div>
                      </div>
                    </ScrollArea>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSelectedPost(null)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => selectedPost && handleGenerateInspiredContent(selectedPost)}
                      disabled={isGeneratingInspired}
                    >
                      {isGeneratingInspired ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate Inspired Content"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>
            
            <TabsContent value="wordpress">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">WordPress Blog</h2>
                <div className="flex gap-2">
                  <Dialog open={isGeneratingContent} onOpenChange={setIsGeneratingContent}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <RefreshCw className="mr-2 h-4 w-4" /> AI Generate
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
                      <DialogHeader>
                        <DialogTitle>Generate Blog Content with AI</DialogTitle>
                        <DialogDescription>
                          Use AI to generate blog posts for your WordPress site.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <AIContentGenerator 
                          socialMediaAccounts={accounts} 
                          onGeneratedContent={handleGeneratedContent} 
                        />
                      </div>
                      <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setIsGeneratingContent(false)}>Cancel</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Create Blog Post
                  </Button>
                </div>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>WordPress Integration</CardTitle>
                  <CardDescription>
                    Connect your WordPress site to publish blog posts directly from InstaCreate.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-4">
                    <div className="p-6 border rounded-md text-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                        <path d="M2 17l10 5 10-5"></path>
                        <path d="M2 12l10 5 10-5"></path>
                      </svg>
                      <h3 className="text-lg font-medium mb-2">WordPress Integration Coming Soon</h3>
                      <p className="text-muted-foreground mb-4">
                        The WordPress integration is currently under development. You'll soon be able to connect your WordPress site and publish blog posts directly.
                      </p>
                      <Button variant="outline" disabled>
                        Connect WordPress Site
                      </Button>
                    </div>
                    
                    <div className="grid gap-4">
                      <h3 className="text-lg font-medium">Blog Post Ideas</h3>
                      <p className="text-muted-foreground">
                        You can still generate blog post content with AI and save it for later use.
                      </p>
                      <Button onClick={() => setIsGeneratingContent(true)}>
                        Generate Blog Post Ideas
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="logging">
              <LogsViewer />
            </TabsContent>
          </Tabs>
        </main>

        {/* Schedule Post Dialog */}
        <Dialog open={isScheduling} onOpenChange={setIsScheduling}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Schedule Post</DialogTitle>
              <DialogDescription>
                Choose when to automatically publish this post.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {scheduleDate ? format(scheduleDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent
                      mode="single"
                      selected={scheduleDate}
                      onSelect={setScheduleDate}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Hour</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={scheduleHour}
                    onChange={(e) => setScheduleHour(parseInt(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Minute</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={scheduleMinute}
                    onChange={(e) => setScheduleMinute(parseInt(e.target.value))}
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>
              {accounts.length > 0 && (
                <div className="grid gap-2">
                  <Label>Social Media Account</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={scheduleAccountId}
                    onChange={(e) => setScheduleAccountId(e.target.value)}
                  >
                    <option value="">Select an account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.username} ({account.accountType === "INSTAGRAM" ? "Instagram" :
                         account.accountType === "BLUESKY" ? "Bluesky" : "X"})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsScheduling(false)}>Cancel</Button>
              <Button onClick={handleSchedulePost} disabled={!scheduleDate}>
                Schedule Post
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}