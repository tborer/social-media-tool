import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useMemo } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/components/ui/use-toast";
import { Instagram, Plus, Calendar, Image, Trash2, Edit, RefreshCw, Settings, Search, UserPlus, Copy } from "lucide-react";
import { useRouter } from "next/router";
import ProtectedRoute from "@/components/ProtectedRoute";
import AIContentGenerator from "@/components/AIContentGenerator";
import LogsViewer from "@/components/LogsViewer";
import { CalendarView } from "@/components/CalendarView";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type SocialMediaAccount = {
  id: string;
  username: string;
  accessToken: string;
  accountType: "INSTAGRAM" | "LINKEDIN" | "BLUESKY" | "X";
  tokenExpiresAt?: string | null;
  linkedinUserId?: string | null;
  xUserId?: string | null;
  instagramAccountType?: string | null;
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
  linkedinPostId?: string | null;
  xPostId?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  socialMediaAccountId?: string;
  targetPlatforms: string[];
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
            onChange={(e) => setFormData({...formData, accountType: e.target.value as "INSTAGRAM" | "LINKEDIN" | "BLUESKY" | "X"})}
          >
            <option value="INSTAGRAM">Instagram</option>
            <option value="LINKEDIN">LinkedIn</option>
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
  const [newAccount, setNewAccount] = useState({ username: "", accessToken: "", accountType: "INSTAGRAM" as "INSTAGRAM" | "LINKEDIN" | "BLUESKY" | "X" });
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [newPost, setNewPost] = useState({
    caption: "",
    imageUrl: "",
    imageFile: null as File | null,
    targetAccountIds: [] as string[],
    xOverrideText: "",
    contentType: "IMAGE",
    videoType: "FEED" as "FEED" | "REELS",
    scheduledFor: null as string | null
  });
  // Multi-platform publish dialog state
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  const [publishDialogAccountIds, setPublishDialogAccountIds] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  
  // Instagram Insights state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [isGeneratingInspired, setIsGeneratingInspired] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [searchFilters, setSearchFilters] = useState<string[]>(["for_you"]);

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
  // Combined cross-platform insights
  const [combinedInsights, setCombinedInsights] = useState<any>(null);
  const [isLoadingCombined, setIsLoadingCombined] = useState(false);
  const [insightsPlatformFilter, setInsightsPlatformFilter] = useState<string>('ALL');
  const [postTableSort, setPostTableSort] = useState<string>('engagement');
  // Caption linter (in create-post dialog + insights)
  const [captionLint, setCaptionLint] = useState<any>(null);
  const [isLintingCaption, setIsLintingCaption] = useState(false);
  // Post refinement (8e)
  const [refinePostId, setRefinePostId] = useState<string>('');
  const [refineTone, setRefineTone] = useState<string>('casual');
  const [refineType, setRefineType] = useState<string>('caption');
  const [refineResult, setRefineResult] = useState<any>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [refinePostCount, setRefinePostCount] = useState<number>(10);
  const [refinePostSort, setRefinePostSort] = useState<string>('engagement');
  const [refinePostSortDir, setRefinePostSortDir] = useState<'desc' | 'asc'>('desc');
  // A/B tests (8e)
  const [abTests, setAbTests] = useState<any[]>([]);
  const [isLoadingABTests, setIsLoadingABTests] = useState(false);
  const [newABTest, setNewABTest] = useState({ postAId: '', postBId: '', notes: '' });
  const [isCreatingABTest, setIsCreatingABTest] = useState(false);
  // Timing optimizer (8e)
  const [bestTimeResult, setBestTimeResult] = useState<any>(null);
  const [isLoadingBestTime, setIsLoadingBestTime] = useState(false);

  // Discovery state
  const [accountSearchResults, setAccountSearchResults] = useState<any[]>([]);
  const [contentIdeas, setContentIdeas] = useState<any[]>([]);
  const [trackedHashtags, setTrackedHashtags] = useState<any[]>([]);
  const [trackedCompetitors, setTrackedCompetitors] = useState<any[]>([]);

  // AI Recommendations state
  const [recommendations, setRecommendations] = useState<any>(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [captionReview, setCaptionReview] = useState<any>(null);
  const [isReviewingCaption, setIsReviewingCaption] = useState(false);

  // Outreach state
  const [contacts, setContacts] = useState<any[]>([]);
  const [outreachMessages, setOutreachMessages] = useState<any[]>([]);
  const [outreachCriteria, setOutreachCriteria] = useState<any[]>([]);
  const [outreachStats, setOutreachStats] = useState<any>(null);
  const [contactFilter, setContactFilter] = useState<string>('');
  const [contactSearch, setContactSearch] = useState('');
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ igUsername: '', displayName: '', niche: '', location: '', notes: '' });
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [messageTemplateType, setMessageTemplateType] = useState('introduction');
  const [customMessageInstructions, setCustomMessageInstructions] = useState('');

  // Instagram prospect search state
  const [igProspectSearchMode, setIgProspectSearchMode] = useState<'username' | 'hashtag' | 'place' | 'location'>('username');
  const [igProspectUsernames, setIgProspectUsernames] = useState('');
  const [igProspectQuery, setIgProspectQuery] = useState(''); // hashtag / place mode
  const [igProspectNiche, setIgProspectNiche] = useState('');
  const [igProspectFollowerMin, setIgProspectFollowerMin] = useState('');
  const [igProspectFollowerMax, setIgProspectFollowerMax] = useState('');
  const [igProspectHasWebsite, setIgProspectHasWebsite] = useState(false);
  const [igProspectMinPosts, setIgProspectMinPosts] = useState('');
  const [igProspectMaxFollowing, setIgProspectMaxFollowing] = useState('');
  const [igProspectAnalyzeImage, setIgProspectAnalyzeImage] = useState(false);
  const [igProspectTargetAgeRange, setIgProspectTargetAgeRange] = useState('any');
  const [igProspectTargetGender, setIgProspectTargetGender] = useState('any');
  const [igProspectShowAdvancedFilters, setIgProspectShowAdvancedFilters] = useState(false);
  const [igProspectResults, setIgProspectResults] = useState<any[]>([]);
  const [igProspectDiscoveredPosts, setIgProspectDiscoveredPosts] = useState<any[]>([]);
  const [igProspectDiscoveredPlaces, setIgProspectDiscoveredPlaces] = useState<any[]>([]);
  const [igProspectLoading, setIgProspectLoading] = useState(false);
  const [igProspectError, setIgProspectError] = useState('');

  // Show toast messages from OAuth redirects (error or success query params)
  useEffect(() => {
    if (!router.isReady) return;
    const { error, success } = router.query;
    if (error && typeof error === 'string') {
      toast({ variant: "destructive", title: "Error", description: error });
      const { error: _e, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    } else if (success === 'instagram_connected') {
      toast({ title: "Success", description: "Instagram account connected successfully" });
      const { success: _s, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    } else if (success === 'linkedin_connected') {
      toast({ title: "Success", description: "LinkedIn account connected successfully" });
      const { success: _s, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    } else if (success === 'x_connected') {
      toast({ title: "Success", description: "X account connected successfully" });
      const { success: _s, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.error, router.query.success]);

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
      fetchContacts();
      fetchOutreachStats();
      fetchOutreachCriteria();
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

    // Per-platform validation across all selected accounts
    const selectedAccounts = accounts.filter(a => newPost.targetAccountIds.includes(a.id));

    for (const acct of selectedAccounts) {
      if (acct.accountType === 'INSTAGRAM') {
        if (newPost.caption.length > 2200) {
          toast({ variant: "destructive", title: "Caption too long", description: `Instagram allows a maximum of 2,200 characters (currently ${newPost.caption.length}).` });
          return;
        }
        const hashtagCount = (newPost.caption.match(/#\w+/g) || []).length;
        if (hashtagCount > 30) {
          toast({ variant: "destructive", title: "Too many hashtags", description: `Instagram allows a maximum of 30 hashtags (you have ${hashtagCount}).` });
          return;
        }
      }
      if (acct.accountType === 'LINKEDIN' && newPost.caption.length > 3000) {
        toast({ variant: "destructive", title: "Caption too long", description: `LinkedIn allows a maximum of 3,000 characters (currently ${newPost.caption.length}).` });
        return;
      }
      if (acct.accountType === 'X' && newPost.xOverrideText && newPost.xOverrideText.length > 280) {
        toast({ variant: "destructive", title: "X tweet text too long", description: `The X override text is ${newPost.xOverrideText.length} characters. Max is 280 (will auto-split if you leave it blank and use the main caption).` });
        return;
      }
    }

    // If no account selected (pure draft), still enforce Instagram hashtag norms as a soft note
    if (selectedAccounts.length === 0) {
      const hashtagCount = (newPost.caption.match(/#\w+/g) || []).length;
      if (hashtagCount > 30) {
        toast({ variant: "destructive", title: "Too many hashtags", description: `Instagram allows a maximum of 30 hashtags (you have ${hashtagCount}). This draft may fail when posted to Instagram.` });
        return;
      }
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

      // Base post data shared across all platforms
      const basePostData = {
        caption: newPost.caption,
        imageUrl: imageUrl,
        contentType: newPost.contentType,
        ...(newPost.contentType === 'VIDEO' ? { videoType: newPost.videoType } : {}),
        ...(saveAsDraft ? { status: 'DRAFT' } : {}),
        ...(newPost.scheduledFor ? { scheduledFor: newPost.scheduledFor } : {}),
      };

      const targetAccounts = accounts.filter(a => newPost.targetAccountIds.includes(a.id));

      toast({
        title: saveAsDraft ? "Saving draft..." : "Creating post...",
        description: targetAccounts.length > 1
          ? `Creating ${targetAccounts.length} posts across platforms…`
          : "Please wait...",
      });

      // Helper to POST one content-post record
      const createOnePost = async (accountId: string | null, captionOverride?: string) => {
        const accountForPost = accountId ? accounts.find(a => a.id === accountId) : null;
        const body = {
          ...basePostData,
          ...(captionOverride ? { caption: captionOverride } : {}),
          ...(accountId ? { socialMediaAccountId: accountId } : {}),
          targetPlatforms: accountForPost ? [accountForPost.accountType] : [],
        };
        const response = await fetch('/api/content-posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include',
        });
        if (!response.ok) {
          let errMsg = 'Failed to create post';
          try {
            const errData = await response.json();
            errMsg = errData.error || errMsg;
          } catch {
            errMsg = response.status === 413
              ? 'Post content is too large. Try a shorter image URL or caption.'
              : `${response.statusText || 'Error'} (${response.status})`;
          }
          throw new Error(errMsg);
        }
        return response.json();
      };

      let createdPosts: any[];

      if (targetAccounts.length === 0) {
        // No account selected — create a single draft
        const result = await createOnePost(null);
        createdPosts = [result];
      } else {
        // Create one post per selected account (in parallel)
        createdPosts = await Promise.all(
          targetAccounts.map(acct => {
            // X accounts use xOverrideText if provided, otherwise the shared caption
            const captionOverride =
              acct.accountType === 'X' && newPost.xOverrideText.trim()
                ? newPost.xOverrideText.trim()
                : undefined;
            return createOnePost(acct.id, captionOverride);
          })
        );
      }

      setPosts(prev => [...createdPosts, ...prev]);
      setNewPost({
        caption: "",
        imageUrl: "",
        imageFile: null,
        targetAccountIds: [],
        xOverrideText: "",
        contentType: "IMAGE",
        videoType: "FEED",
        scheduledFor: null
      });
      setIsCreatingPost(false);

      const platformNames = targetAccounts.map(a =>
        a.accountType === 'INSTAGRAM' ? 'Instagram' :
        a.accountType === 'LINKEDIN'  ? 'LinkedIn'  :
        a.accountType === 'X'         ? 'X'         : a.accountType
      ).join(', ');

      toast({
        title: "Success",
        description: saveAsDraft
          ? `Draft saved${platformNames ? ` for ${platformNames}` : ''}`
          : createdPosts.length > 1
            ? `${createdPosts.length} posts created for ${platformNames}`
            : "Post created successfully",
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
      targetAccountIds: newPost.targetAccountIds,
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
      const filtersParam = searchFilters.length > 0 ? `&filters=${encodeURIComponent(searchFilters.join(','))}` : '';
      const response = await fetch(
        `/api/instagram/search?query=${encodeURIComponent(searchQuery)}${filtersParam}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search Instagram content');
      }

      const data = await response.json();
      if (data.searchType === 'combined') {
        setSearchResults(data.results || []);
        setAccountSearchResults(data.accountResults || []);
        const totalCount = (data.results?.length || 0) + (data.accountResults?.length || 0);
        toast({ title: "Search Complete", description: `Found ${totalCount} results` });
      } else if (data.searchType === 'account') {
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

  // Outreach functions
  const fetchContacts = async (status?: string, search?: string) => {
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const response = await fetch(`/api/outreach/contacts?${params}`, { credentials: 'include' });
      if (response.ok) setContacts(await response.json());
    } catch { /* silent */ }
  };

  const fetchOutreachStats = async () => {
    try {
      const response = await fetch('/api/outreach/stats', { credentials: 'include' });
      if (response.ok) setOutreachStats(await response.json());
    } catch { /* silent */ }
  };

  const fetchOutreachCriteria = async () => {
    try {
      const response = await fetch('/api/outreach/criteria', { credentials: 'include' });
      if (response.ok) setOutreachCriteria(await response.json());
    } catch { /* silent */ }
  };

  const addContact = async () => {
    if (!newContact.igUsername.trim()) { toast({ variant: "destructive", title: "Error", description: "Username is required" }); return; }
    try {
      const response = await fetch('/api/outreach/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact), credentials: 'include',
      });
      if (response.status === 409) { toast({ title: "Exists", description: "Contact already in your list" }); return; }
      if (!response.ok) throw new Error('Failed to add contact');
      toast({ title: "Added", description: `@${newContact.igUsername.replace(/^@/, '')} added to contacts` });
      setNewContact({ igUsername: '', displayName: '', niche: '', location: '', notes: '' });
      setIsAddingContact(false);
      fetchContacts(contactFilter, contactSearch);
      fetchOutreachStats();
    } catch { toast({ variant: "destructive", title: "Error", description: "Failed to add contact" }); }
  };

  const updateContactStatus = async (contactId: string, status: string) => {
    try {
      const response = await fetch(`/api/outreach/contacts/${contactId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }), credentials: 'include',
      });
      if (response.ok) {
        setContacts(contacts.map(c => c.id === contactId ? { ...c, status } : c));
        fetchOutreachStats();
      }
    } catch { /* silent */ }
  };

  const deleteContact = async (contactId: string) => {
    try {
      await fetch(`/api/outreach/contacts/${contactId}`, { method: 'DELETE', credentials: 'include' });
      setContacts(contacts.filter(c => c.id !== contactId));
      if (selectedContact?.id === contactId) setSelectedContact(null);
      fetchOutreachStats();
    } catch { /* silent */ }
  };

  const generateOutreachMessage = async (contactId: string) => {
    setIsGeneratingMessage(true);
    try {
      const response = await fetch('/api/outreach/generate-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, templateType: messageTemplateType, customInstructions: customMessageInstructions || undefined }),
        credentials: 'include',
      });
      if (!response.ok) { const d = await response.json(); throw new Error(d.error || 'Failed'); }
      const data = await response.json();
      // Auto-save as draft
      await fetch('/api/outreach/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, messageBody: data.messageBody, templateName: data.templateType, status: 'DRAFT' }),
        credentials: 'include',
      });
      toast({ title: "Message Generated", description: "AI-generated message saved as draft" });
      fetchContactMessages(contactId);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to generate message" });
    } finally { setIsGeneratingMessage(false); }
  };

  const fetchContactMessages = async (contactId: string) => {
    try {
      const response = await fetch(`/api/outreach/messages?contactId=${contactId}`, { credentials: 'include' });
      if (response.ok) setOutreachMessages(await response.json());
    } catch { /* silent */ }
  };

  const updateMessageStatus = async (messageId: string, status: string) => {
    try {
      const response = await fetch('/api/outreach/messages', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: messageId, status }), credentials: 'include',
      });
      if (response.ok) {
        const updated = await response.json();
        setOutreachMessages(outreachMessages.map(m => m.id === messageId ? updated : m));
        fetchContacts(contactFilter, contactSearch);
        fetchOutreachStats();
      }
    } catch { /* silent */ }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await fetch('/api/outreach/messages', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: messageId }), credentials: 'include',
      });
      setOutreachMessages(outreachMessages.filter(m => m.id !== messageId));
    } catch { /* silent */ }
  };

  const searchIGProspects = async () => {
    const isUserMode = igProspectSearchMode === 'username';
    const queryVal = isUserMode ? igProspectUsernames : igProspectQuery;
    if (!queryVal.trim()) return;

    setIgProspectLoading(true);
    setIgProspectError('');
    setIgProspectResults([]);
    setIgProspectDiscoveredPosts([]);
    setIgProspectDiscoveredPlaces([]);

    try {
      const params = new URLSearchParams({ searchMode: igProspectSearchMode });
      if (isUserMode) {
        params.set('usernames', igProspectUsernames.trim());
      } else {
        params.set('query', igProspectQuery.trim());
      }
      if (igProspectNiche.trim()) params.set('niche', igProspectNiche.trim());
      if (igProspectFollowerMin.trim()) params.set('followerMin', igProspectFollowerMin.trim());
      if (igProspectFollowerMax.trim()) params.set('followerMax', igProspectFollowerMax.trim());
      if (igProspectHasWebsite) params.set('hasWebsite', 'true');
      if (igProspectMinPosts.trim()) params.set('minPosts', igProspectMinPosts.trim());
      if (igProspectMaxFollowing.trim()) params.set('maxFollowing', igProspectMaxFollowing.trim());
      if (igProspectAnalyzeImage) params.set('analyzeImage', 'true');
      if (igProspectAnalyzeImage && igProspectTargetAgeRange !== 'any') params.set('targetAgeRange', igProspectTargetAgeRange);
      if (igProspectAnalyzeImage && igProspectTargetGender !== 'any') params.set('targetGender', igProspectTargetGender);

      const res = await fetch(`/api/outreach/instagram-search?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        setIgProspectError(data.error || 'Search failed');
        return;
      }
      setIgProspectResults(data.results || []);
      setIgProspectDiscoveredPosts(data.discoveredPosts || []);
      setIgProspectDiscoveredPlaces(data.discoveredPlaces || []);
      const totalFound = (data.results || []).length + (data.discoveredPosts || []).length + (data.discoveredPlaces || []).length;
      if (totalFound === 0) {
        setIgProspectError(
          isUserMode
            ? 'No matching accounts found. Check the username(s) and try again.'
            : 'No results found. Try a different search term.'
        );
      }
    } catch {
      setIgProspectError('Search failed. Please try again.');
    } finally {
      setIgProspectLoading(false);
    }
  };

  const addIGProspectAsContact = async (prospect: any) => {
    try {
      const res = await fetch('/api/outreach/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          igUsername: prospect.username,
          displayName: prospect.name || '',
          bio: prospect.bio || '',
          followerCount: prospect.followers || null,
          engagementRate: prospect.engagementRate || null,
          niche: igProspectNiche.trim() || '',
          notes: prospect.aiSummary ? `AI Analysis: ${prospect.aiSummary}` : '',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Contact added', description: `@${prospect.username} added to your outreach list` });
        fetchContacts(contactFilter, contactSearch);
        fetchOutreachStats();
        // Mark the result as added
        setIgProspectResults(prev =>
          prev.map(r => r.username === prospect.username ? { ...r, added: true } : r)
        );
      } else {
        toast({ variant: 'destructive', title: 'Error', description: data.error || 'Failed to add contact' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to add contact' });
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

      // Attempt native platform scheduling for Instagram and LinkedIn
      const selectedAccount = scheduleAccountId
        ? accounts.find(a => a.id === scheduleAccountId)
        : null;
      const supportsNative =
        selectedAccount &&
        (selectedAccount.accountType === 'INSTAGRAM' || selectedAccount.accountType === 'LINKEDIN');

      if (supportsNative) {
        try {
          const nativeRes = await fetch(`/api/content-posts/${schedulingPostId}/schedule-native`, {
            method: 'POST',
            credentials: 'include',
          });
          const nativeData = await nativeRes.json();
          if (nativeData.nativeScheduled) {
            toast({ title: "Scheduled", description: nativeData.message });
          } else {
            toast({
              title: "Scheduled",
              description: `Post scheduled for ${scheduledDateTime.toLocaleString()}. ${nativeData.message || 'Will be published by the scheduler.'}`,
            });
          }
        } catch {
          toast({ title: "Scheduled", description: `Post scheduled for ${scheduledDateTime.toLocaleString()}` });
        }
      } else {
        toast({ title: "Scheduled", description: `Post scheduled for ${scheduledDateTime.toLocaleString()}` });
      }

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

  // Fetch combined cross-platform insights
  const fetchCombinedInsights = async (platform = 'ALL') => {
    setIsLoadingCombined(true);
    try {
      const response = await fetch(`/api/insights/combined-insights?platform=${platform}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setCombinedInsights(data);
      }
    } catch (error) {
      console.error('Error fetching combined insights:', error);
    } finally {
      setIsLoadingCombined(false);
    }
  };

  // Sync Instagram posts and fetch their insights
  const [isSyncingIgPosts, setIsSyncingIgPosts] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  const syncIgPosts = async (postLimit = refinePostCount) => {
    const igAccount = accounts.find((a: SocialMediaAccount) => a.accountType === 'INSTAGRAM');
    if (!igAccount) {
      toast({ variant: "destructive", title: "No Instagram account", description: "Connect an Instagram account first." });
      return;
    }
    setIsSyncingIgPosts(true);
    setSyncResult(null);
    try {
      const response = await fetch('/api/insights/sync-ig-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: igAccount.id, fetchInsights: true, limit: postLimit }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }
      setSyncResult(data);
      toast({ title: "Instagram Sync Complete", description: `Imported ${data.imported} new posts, fetched insights for ${data.insightsFetched} posts.` });
      // Reload combined insights to reflect new data
      await fetchCombinedInsights(insightsPlatformFilter);
      // Reload posts list
      const postsRes = await fetch('/api/content-posts', { credentials: 'include' });
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        setPosts(postsData);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Sync Error", description: error instanceof Error ? error.message : "Failed to sync Instagram posts" });
    } finally {
      setIsSyncingIgPosts(false);
    }
  };

  // Copy a published post to a new draft
  const [isCopyingToDraft, setIsCopyingToDraft] = useState(false);
  const copyPostToDraft = async (postId: string) => {
    setIsCopyingToDraft(true);
    try {
      const response = await fetch(`/api/content-posts/${postId}/copy-to-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to copy post');
      }
      // Add the new draft to the local posts list
      setPosts(prev => [data, ...prev]);
      toast({ title: "Copied to Draft", description: "Post copied as a new draft. You can edit it in the Content Creation tab." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to copy post to draft" });
    } finally {
      setIsCopyingToDraft(false);
    }
  };

  // Refresh LinkedIn/X insights for an account
  const refreshPlatformAccountInsights = async (accountId: string, platform: 'LINKEDIN' | 'X') => {
    setIsFetchingInsights(true);
    try {
      const endpoint = platform === 'LINKEDIN' ? '/api/insights/linkedin-insights' : '/api/insights/x-insights';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch insights');
      }
      toast({ title: "Success", description: `${platform} insights updated` });
      fetchCombinedInsights(insightsPlatformFilter);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed to fetch insights" });
    } finally {
      setIsFetchingInsights(false);
    }
  };

  // Lint caption quality (8d)
  const lintCaption = async (caption: string, platform = 'INSTAGRAM') => {
    if (!caption.trim()) return;
    setIsLintingCaption(true);
    try {
      const response = await fetch('/api/insights/lint-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption, platform }),
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setCaptionLint(data);
      }
    } catch (error) {
      console.error('Caption lint error:', error);
    } finally {
      setIsLintingCaption(false);
    }
  };

  // AI post refinement (8e)
  const refinePost = async (postId: string) => {
    setIsRefining(true);
    setRefineResult(null);
    try {
      const response = await fetch('/api/ai/refine-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, type: refineType, tone: refineTone }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Refinement failed');
      setRefineResult(data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Refinement failed" });
    } finally {
      setIsRefining(false);
    }
  };

  // Load A/B tests (8e)
  const loadABTests = async () => {
    setIsLoadingABTests(true);
    try {
      const response = await fetch('/api/insights/ab-tests', { credentials: 'include' });
      if (response.ok) setAbTests(await response.json());
    } catch (error) {
      console.error('Error loading A/B tests:', error);
    } finally {
      setIsLoadingABTests(false);
    }
  };

  // Create A/B test (8e)
  const createABTest = async () => {
    if (!newABTest.postAId || !newABTest.postBId) {
      toast({ variant: "destructive", title: "Error", description: "Select both Post A and Post B" });
      return;
    }
    try {
      const response = await fetch('/api/insights/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newABTest),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create A/B test');
      toast({ title: "Success", description: "A/B test created" });
      setNewABTest({ postAId: '', postBId: '', notes: '' });
      loadABTests();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed" });
    }
  };

  // Mark A/B test winner (8e)
  const markABWinner = async (testId: string, winnerId: string) => {
    try {
      const response = await fetch(`/api/insights/ab-tests?id=${testId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update A/B test');
      toast({ title: "Success", description: "Winner marked" });
      loadABTests();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: error instanceof Error ? error.message : "Failed" });
    }
  };

  // Timing optimizer — fetch best posting time (8e)
  const loadBestTime = async (platform?: string, accountId?: string) => {
    setIsLoadingBestTime(true);
    setBestTimeResult(null);
    try {
      const params = new URLSearchParams();
      if (platform) params.set('platform', platform);
      if (accountId) params.set('accountId', accountId);
      const response = await fetch(`/api/insights/best-time?${params}`, { credentials: 'include' });
      if (response.ok) setBestTimeResult(await response.json());
    } catch (error) {
      console.error('Error loading best time:', error);
    } finally {
      setIsLoadingBestTime(false);
    }
  };

  // Chart data: engagement over time (grouped by month per platform)
  const engagementOverTimeData = useMemo(() => {
    if (!combinedInsights?.postTable) return [];
    const monthMap = new Map<string, Record<string, number[]>>();
    for (const post of combinedInsights.postTable as any[]) {
      if (!post.platformInsights?.length || !post.updatedAt) continue;
      const month = new Date(post.updatedAt).toISOString().slice(0, 7);
      if (!monthMap.has(month)) monthMap.set(month, {});
      const md = monthMap.get(month)!;
      for (const ins of post.platformInsights as any[]) {
        if (ins.engagement == null) continue;
        if (!md[ins.platform]) md[ins.platform] = [];
        md[ins.platform].push(ins.engagement);
      }
    }
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, platforms]) => ({
        month,
        ...Object.fromEntries(
          Object.entries(platforms).map(([pl, engs]) => [
            pl,
            parseFloat((engs.reduce((s, v) => s + v, 0) / engs.length).toFixed(2)),
          ])
        ),
      }));
  }, [combinedInsights]);

  // Chart data: unique platforms with insight data
  const insightPlatforms = useMemo(() => {
    if (!combinedInsights?.postTable) return [];
    const set = new Set<string>();
    for (const post of combinedInsights.postTable as any[]) {
      for (const ins of (post.platformInsights ?? []) as any[]) {
        if (ins.platform) set.add(ins.platform);
      }
    }
    return Array.from(set);
  }, [combinedInsights]);

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
              <TabsTrigger value="insights">Combined Insights</TabsTrigger>
              <TabsTrigger value="outreach">Outreach</TabsTrigger>
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
                          onChange={(e) => setNewAccount({...newAccount, accountType: e.target.value as "INSTAGRAM" | "LINKEDIN" | "BLUESKY" | "X"})}
                        >
                          <option value="INSTAGRAM">Instagram</option>
                          <option value="LINKEDIN">LinkedIn</option>
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

                      {newAccount.accountType === "LINKEDIN" && (
                        <div className="grid gap-3 p-4 border rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                            <span className="font-medium">LinkedIn OAuth</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Connect your LinkedIn account securely using OAuth. Access tokens are valid for 60 days and you will be prompted to reconnect when they expire.
                          </p>
                          <Button
                            onClick={() => {
                              window.location.href = '/api/auth/linkedin/connect?returnUrl=/dashboard';
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                          >
                            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                            Connect with LinkedIn
                          </Button>
                          <p className="text-xs text-muted-foreground text-center">
                            Secure OAuth 2.0 authentication
                          </p>
                        </div>
                      )}

                      {newAccount.accountType === "X" && (
                        <div className="grid gap-3 p-4 border rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                            <span className="font-medium">X (Twitter) OAuth</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Connect your X account securely using OAuth 2.0 with PKCE. Access tokens are automatically refreshed using a refresh token.
                          </p>
                          <Button
                            onClick={() => {
                              window.location.href = '/api/auth/x/connect?returnUrl=/dashboard';
                            }}
                            className="w-full bg-black hover:bg-gray-900"
                          >
                            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                            Connect with X
                          </Button>
                          <p className="text-xs text-muted-foreground text-center">
                            Secure OAuth 2.0 with PKCE
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
                          {account.accountType === "LINKEDIN" && <svg className="h-5 w-5 mr-2 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>}
                          {account.accountType === "BLUESKY" && <svg className="h-5 w-5 mr-2 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"/><path d="M13 7h-2v6h6v-2h-4z"/></svg>}
                          {account.accountType === "X" && <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
                          {account.username}
                        </CardTitle>
                        <CardDescription>
                          {account.accountType === "INSTAGRAM" ? "Instagram" :
                           account.accountType === "LINKEDIN" ? "LinkedIn" :
                           account.accountType === "BLUESKY" ? "Bluesky" : "X"}
                        </CardDescription>
                        {account.tokenExpiresAt && (() => {
                          const expiresAt = new Date(account.tokenExpiresAt!);
                          const now = new Date();
                          const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          if (expiresAt <= now) {
                            return (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">Token expired — reconnect required</span>
                              </div>
                            );
                          }
                          if (daysLeft <= 7) {
                            return (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Token expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </CardHeader>
                      <CardFooter className="flex flex-wrap gap-2 justify-between">
                        {(account.accountType === "LINKEDIN" || account.accountType === "X" || account.accountType === "INSTAGRAM") && (() => {
                          const connectPath =
                            account.accountType === "LINKEDIN" ? "/api/auth/linkedin/connect" :
                            account.accountType === "X" ? "/api/auth/x/connect" :
                            "/api/auth/instagram/connect";
                          const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null;
                          const isExpiredOrExpiring = expiresAt && expiresAt <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                          if (!isExpiredOrExpiring) return null;
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-amber-300 text-amber-700 hover:bg-amber-50"
                              onClick={() => {
                                window.location.href = `${connectPath}?returnUrl=/dashboard`;
                              }}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" /> Reconnect
                            </Button>
                          );
                        })()}
                        <div className="flex gap-2 ml-auto">
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
                                account.accountType === "LINKEDIN" ? "LinkedIn" :
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
                                      account.accountType === "LINKEDIN" ? "LinkedIn" :
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
                        </div>
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
                          Use AI to generate captions and images for your posts.
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
                        <DialogTitle>Create Post</DialogTitle>
                        <DialogDescription>
                          Craft your post content and choose which platforms to publish to.
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
                          {newPost.contentType === 'VIDEO' && (() => {
                            const hasInstagram = newPost.targetAccountIds.some(id => accounts.find(a => a.id === id)?.accountType === 'INSTAGRAM');
                            return (
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
                                  {/* Reels is Instagram-only */}
                                  {(hasInstagram || newPost.targetAccountIds.length === 0) && (
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="REELS" id="video-reels-type" />
                                      <Label htmlFor="video-reels-type" className="cursor-pointer">
                                        Reels
                                        <span className="text-xs text-muted-foreground block">Vertical (9:16), 3-90 seconds · Instagram only</span>
                                      </Label>
                                    </div>
                                  )}
                                </RadioGroup>
                                {!hasInstagram && newPost.targetAccountIds.length > 0 && newPost.videoType === 'REELS' && (
                                  <p className="text-xs text-amber-600">Reels is Instagram-only. Add an Instagram account or switch to Feed Video.</p>
                                )}
                              </div>
                            );
                          })()}

                          <div className="grid gap-2">
                            <Label htmlFor="caption">Caption</Label>
                            <Textarea
                              id="caption"
                              value={newPost.caption}
                              onChange={(e) => setNewPost({...newPost, caption: e.target.value})}
                              placeholder="Write your post caption here..."
                              className="min-h-[100px]"
                            />
                            {(() => {
                              const len = newPost.caption.length;
                              const hashtagCount = (newPost.caption.match(/#\w+/g) || []).length;
                              const selectedAccts = accounts.filter(a => newPost.targetAccountIds.includes(a.id));
                              const hasInstagram = selectedAccts.some(a => a.accountType === 'INSTAGRAM') || selectedAccts.length === 0;
                              const hasLinkedIn = selectedAccts.some(a => a.accountType === 'LINKEDIN');
                              const hasX = selectedAccts.some(a => a.accountType === 'X');
                              const primaryLimit = hasInstagram ? 2200 : hasLinkedIn ? 3000 : null;
                              return (
                                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                  <span className={primaryLimit !== null && len > primaryLimit ? 'text-destructive font-medium' : ''}>
                                    {len}{primaryLimit !== null ? `/${primaryLimit.toLocaleString()}` : ''} characters
                                  </span>
                                  {hasInstagram && (
                                    <span className={hashtagCount > 30 ? 'text-destructive font-medium' : ''}>
                                      {hashtagCount}/30 hashtags
                                    </span>
                                  )}
                                  {hasX && !hasInstagram && (
                                    <span className={len > 280 ? 'text-amber-600 font-medium' : ''}>
                                      {len > 280 ? `Thread (${Math.ceil(len / 272)} tweets)` : `${len}/280 chars · X`}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
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
                          {/* Platform / Account selector — multi-select toggle cards */}
                          {accounts.length > 0 && (
                            <div className="grid gap-2">
                              <div className="flex items-center justify-between">
                                <Label>Post to</Label>
                                {newPost.targetAccountIds.length > 0 && (
                                  <button
                                    type="button"
                                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                                    onClick={() => setNewPost({ ...newPost, targetAccountIds: [] })}
                                  >
                                    Clear all
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground -mt-1">
                                Select one or more accounts. Leave blank to save as a draft without a platform.
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {accounts.map((account) => {
                                  const isSelected = newPost.targetAccountIds.includes(account.id);
                                  const platformLabel =
                                    account.accountType === 'INSTAGRAM' ? 'Instagram' :
                                    account.accountType === 'LINKEDIN'  ? 'LinkedIn'  :
                                    account.accountType === 'X'         ? 'X'         : 'Bluesky';
                                  const platformIcon =
                                    account.accountType === 'INSTAGRAM'
                                      ? <Instagram className="h-4 w-4 text-pink-500 shrink-0" />
                                      : account.accountType === 'LINKEDIN'
                                        ? <svg className="h-4 w-4 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                        : account.accountType === 'X'
                                          ? <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                          : <svg className="h-4 w-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2z"/></svg>;

                                  return (
                                    <button
                                      key={account.id}
                                      type="button"
                                      onClick={() => {
                                        const ids = isSelected
                                          ? newPost.targetAccountIds.filter(id => id !== account.id)
                                          : [...newPost.targetAccountIds, account.id];
                                        setNewPost({ ...newPost, targetAccountIds: ids });
                                      }}
                                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-sm transition-colors w-full ${
                                        isSelected
                                          ? 'border-primary bg-primary/5 font-medium'
                                          : 'border-border bg-background hover:bg-muted/50'
                                      }`}
                                    >
                                      {platformIcon}
                                      <span className="flex-1 truncate">{account.username}</span>
                                      <span className="text-xs text-muted-foreground shrink-0">{platformLabel}</span>
                                      {isSelected && (
                                        <span className="text-primary shrink-0 text-xs font-bold">✓</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Per-platform character count for each selected account */}
                              {newPost.targetAccountIds.length > 0 && (
                                <div className="space-y-1 mt-1">
                                  {accounts
                                    .filter(a => newPost.targetAccountIds.includes(a.id))
                                    .map(acct => {
                                      const len = newPost.caption.length;
                                      if (acct.accountType === 'X') {
                                        const effectiveLen = newPost.xOverrideText.trim()
                                          ? newPost.xOverrideText.length
                                          : len;
                                        const tweetCount = effectiveLen <= 272 ? 1 : Math.ceil(effectiveLen / 272);
                                        const isThread = tweetCount > 1;
                                        return (
                                          <div key={acct.id} className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${isThread ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-muted-foreground bg-muted/40'}`}>
                                            <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                            {isThread
                                              ? `Thread: ~${tweetCount} tweets (exceeds 280 chars — auto-split)`
                                              : `${effectiveLen}/280 chars${newPost.xOverrideText.trim() ? ' (using X override)' : ''}`}
                                          </div>
                                        );
                                      }
                                      if (acct.accountType === 'LINKEDIN') {
                                        const limit = 3000;
                                        const over = len > limit;
                                        const hashtagCount = (newPost.caption.match(/#\w+/g) || []).length;
                                        const tooManyTags = hashtagCount > 5;
                                        return (
                                          <div key={acct.id} className="space-y-0.5">
                                            <div className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${over ? 'bg-red-50 text-red-700 border border-red-200' : len > 2700 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-muted-foreground bg-muted/40'}`}>
                                              <svg className="h-3 w-3 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                              LinkedIn: {len.toLocaleString()}/{limit.toLocaleString()} chars{over ? ' — over limit!' : len > 2700 ? ' (approaching limit)' : ''}
                                            </div>
                                            {tooManyTags && (
                                              <div className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                                {hashtagCount} hashtags — LinkedIn recommends 3–5 for best reach
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }
                                      if (acct.accountType === 'INSTAGRAM') {
                                        const limit = 2200;
                                        const over = len > limit;
                                        const hashCount = (newPost.caption.match(/#\w+/g) || []).length;
                                        return (
                                          <div key={acct.id} className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${over || hashCount > 30 ? 'bg-red-50 text-red-700 border border-red-200' : len > 1980 || hashCount > 25 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-muted-foreground bg-muted/40'}`}>
                                            <Instagram className="h-3 w-3 text-pink-500 shrink-0" />
                                            Instagram: {len.toLocaleString()}/{limit.toLocaleString()} chars · {hashCount}/30 hashtags{over ? ' — over limit!' : len > 1980 ? ' (approaching limit)' : ''}
                                          </div>
                                        );
                                      }
                                      return null;
                                    })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* X tweet text override — shown only when an X account is selected */}
                          {newPost.targetAccountIds.some(id => accounts.find(a => a.id === id)?.accountType === 'X') && (
                            <div className="grid gap-2">
                              <Label htmlFor="xOverrideText">
                                X Tweet Text
                                <span className="text-xs font-normal text-muted-foreground ml-1.5">(optional — leave blank to auto-use caption)</span>
                              </Label>
                              <Textarea
                                id="xOverrideText"
                                value={newPost.xOverrideText}
                                onChange={(e) => setNewPost({ ...newPost, xOverrideText: e.target.value })}
                                placeholder="Shorter version for X (280 chars max). Leave blank and the main caption will be used — if it exceeds 280 chars it will auto-split into a thread."
                                className="min-h-[70px] text-sm"
                              />
                              <div className="flex justify-between text-xs">
                                <span className={
                                  newPost.xOverrideText.length > 280
                                    ? 'text-destructive font-medium'
                                    : newPost.xOverrideText.length > 250
                                      ? 'text-amber-600'
                                      : 'text-muted-foreground'
                                }>
                                  {newPost.xOverrideText.length}/280 characters
                                </span>
                                {newPost.xOverrideText.length === 0 && (
                                  <span className="text-muted-foreground italic">caption will be used (may thread)</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Caption Quality Linter (8d) */}
                          {newPost.caption.trim().length > 20 && (
                            <div className="grid gap-2">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const acct = accounts.find(a => a.id === newPost.targetAccountIds[0]);
                                    lintCaption(newPost.caption, acct?.accountType || 'INSTAGRAM');
                                  }}
                                  disabled={isLintingCaption}
                                >
                                  {isLintingCaption ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                                  Check Caption Quality
                                </Button>
                                {captionLint && (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${captionLint.grade === 'green' ? 'bg-green-100 text-green-700' : captionLint.grade === 'yellow' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                    {captionLint.score}/100 · {captionLint.grade.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              {captionLint?.suggestions?.length > 0 && (
                                <div className="rounded-lg border bg-muted/50 p-3 text-xs space-y-1">
                                  {captionLint.suggestions.map((s: string, i: number) => (
                                    <div key={i} className="flex items-start gap-1.5">
                                      <span className="text-amber-600 shrink-0 mt-0.5">•</span>
                                      <span>{s}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Timing Optimizer (8e) */}
                          <div className="grid gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const acct = accounts.find(a => a.id === newPost.targetAccountIds[0]);
                                  loadBestTime(acct?.accountType, acct?.id);
                                }}
                                disabled={isLoadingBestTime}
                              >
                                {isLoadingBestTime ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                                Best Time to Post
                              </Button>
                              {bestTimeResult && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>→ <strong>{bestTimeResult.dayName}</strong> at <strong>{bestTimeResult.hour}:00 UTC</strong></span>
                                  {bestTimeResult.avgEngagement !== null && (
                                    <span className="text-green-700">({bestTimeResult.avgEngagement}% avg eng)</span>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      if (bestTimeResult.isoString) {
                                        setNewPost({ ...newPost, scheduledFor: bestTimeResult.isoString });
                                        setBestTimeResult(null);
                                      }
                                    }}
                                  >
                                    Use This Time
                                  </Button>
                                </div>
                              )}
                              {bestTimeResult?.note && (
                                <span className="text-xs text-muted-foreground">{bestTimeResult.note}</span>
                              )}
                            </div>
                          </div>
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
                            <Button
                              className="flex-1"
                              size="sm"
                              onClick={() => {
                                setPublishingPostId(post.id);
                                setPublishDialogAccountIds(post.targetPlatforms?.length
                                  ? accounts.filter(a => post.targetPlatforms.includes(a.accountType)).map(a => a.id)
                                  : []);
                                setIsPublishDialogOpen(true);
                              }}
                            >
                              Post Now
                            </Button>
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
                        {(post.status === 'PUBLISHED' || post.status === 'FAILED') && (
                          <div className="w-full mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => copyPostToDraft(post.id)}
                              disabled={isCopyingToDraft}
                            >
                              <Copy className="h-4 w-4 mr-2" /> Copy to Draft
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
                      Create your first post to get started.
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
                                  targetAccountIds: post.socialMediaAccountId ? [post.socialMediaAccountId] : [],
                                  xOverrideText: "",
                                  contentType: post.contentType,
                                  videoType: (post.videoType as "FEED" | "REELS") || "FEED",
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
                              <Button
                                className="flex-1"
                                size="sm"
                                onClick={() => {
                                  setPublishingPostId(post.id);
                                  setPublishDialogAccountIds(post.targetPlatforms?.length
                                    ? accounts.filter(a => post.targetPlatforms.includes(a.accountType)).map(a => a.id)
                                    : []);
                                  setIsPublishDialogOpen(true);
                                }}
                              >
                                Post Now
                              </Button>
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
                                    {(post.igMediaId || post.linkedinPostId)
                                      ? 'Published by platform — updating status shortly'
                                      : 'Publishing now via scheduler…'}
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
                          <CardFooter className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyPostToDraft(post.id)}
                              disabled={isCopyingToDraft}
                            >
                              <Copy className="h-4 w-4 mr-2" /> Copy to Draft
                            </Button>
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
              <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                <h2 className="text-3xl font-bold">Combined Insights</h2>
                <div className="flex items-center gap-2">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={insightsPlatformFilter}
                    onChange={(e) => {
                      setInsightsPlatformFilter(e.target.value);
                      fetchCombinedInsights(e.target.value);
                    }}
                  >
                    <option value="ALL">All Platforms</option>
                    <option value="INSTAGRAM">Instagram</option>
                    <option value="LINKEDIN">LinkedIn</option>
                    <option value="X">X (Twitter)</option>
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchCombinedInsights(insightsPlatformFilter)}
                    disabled={isLoadingCombined}
                  >
                    {isLoadingCombined ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                    Load Insights
                  </Button>
                </div>
              </div>

              {/* ---- Account Overview Strip ---- */}
              {accounts.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3">Account Overview</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.map((acct) => {
                      const overview = combinedInsights?.accountOverview?.find((o: any) => o.accountId === acct.id);
                      const platformColor = acct.accountType === 'INSTAGRAM' ? 'text-pink-500' : acct.accountType === 'LINKEDIN' ? 'text-blue-600' : 'text-foreground';
                      const platformLabel = acct.accountType === 'INSTAGRAM' ? 'Instagram' : acct.accountType === 'LINKEDIN' ? 'LinkedIn' : acct.accountType === 'X' ? 'X' : acct.accountType;
                      const followers = overview?.followers ?? 0;
                      const growth = overview?.followerGrowth ?? null;
                      return (
                        <Card key={acct.id} className="relative">
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="font-semibold text-sm">@{acct.username}</p>
                                <p className={`text-xs ${platformColor}`}>{platformLabel}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (acct.accountType === 'INSTAGRAM') refreshAccountInsights(acct.id);
                                  else refreshPlatformAccountInsights(acct.id, acct.accountType as 'LINKEDIN' | 'X');
                                }}
                                disabled={isFetchingInsights}
                                title="Refresh insights"
                              >
                                <RefreshCw className={`h-4 w-4 ${isFetchingInsights ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>
                            {overview ? (
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                  <div className="text-xl font-bold">{followers.toLocaleString()}</div>
                                  <div className="text-xs text-muted-foreground">Followers</div>
                                  {growth !== null && growth !== 0 && (
                                    <div className={`text-xs mt-0.5 font-medium ${growth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {growth > 0 ? '+' : ''}{growth.toLocaleString()}
                                    </div>
                                  )}
                                </div>
                                {acct.accountType === 'INSTAGRAM' ? (
                                  <>
                                    <div>
                                      <div className="text-xl font-bold">{(overview.profileViews ?? 0).toLocaleString()}</div>
                                      <div className="text-xs text-muted-foreground">Profile Views</div>
                                    </div>
                                    <div>
                                      <div className="text-xl font-bold">{(overview.mediaCount ?? 0).toLocaleString()}</div>
                                      <div className="text-xs text-muted-foreground">Posts</div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div>
                                      <div className="text-xl font-bold">{(overview.following ?? 0).toLocaleString()}</div>
                                      <div className="text-xs text-muted-foreground">Following</div>
                                    </div>
                                    <div>
                                      <div className="text-xl font-bold">{(overview.mediaCount ?? 0).toLocaleString()}</div>
                                      <div className="text-xs text-muted-foreground">Posts</div>
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-3">No data yet — click refresh.</p>
                            )}
                            {overview?.lastFetchedAt && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Updated {new Date(overview.lastFetchedAt).toLocaleDateString()}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ---- Platform Stats Summary ---- */}
              {combinedInsights?.summary?.platformStats?.length > 0 && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>Platform Comparison</CardTitle>
                    <CardDescription>Average engagement metrics across your connected platforms.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Platform</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Posts</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Avg Engagement</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Avg Likes</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Avg Comments</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Avg Reach</th>
                          </tr>
                        </thead>
                        <tbody>
                          {combinedInsights.summary.platformStats.map((stat: any) => (
                            <tr key={stat.platform} className="border-b last:border-0">
                              <td className="py-2 pr-4 font-medium">
                                <span className={stat.platform === 'INSTAGRAM' ? 'text-pink-500' : stat.platform === 'LINKEDIN' ? 'text-blue-600' : ''}>
                                  {stat.platform === 'INSTAGRAM' ? 'Instagram' : stat.platform === 'LINKEDIN' ? 'LinkedIn' : 'X'}
                                </span>
                              </td>
                              <td className="text-right py-2 px-2">{stat.totalPosts}</td>
                              <td className="text-right py-2 px-2 font-semibold">{stat.avgEngagement.toFixed(2)}%</td>
                              <td className="text-right py-2 px-2">{stat.avgLikes.toFixed(0)}</td>
                              <td className="text-right py-2 px-2">{stat.avgComments.toFixed(0)}</td>
                              <td className="text-right py-2 px-2">{stat.avgReach.toFixed(0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ---- Performance Charts (8b) ---- */}
              {combinedInsights && (engagementOverTimeData.length >= 2 || (combinedInsights.summary?.contentTypeBreakdown?.length > 0)) && (
                <div className="grid gap-6 mb-6 md:grid-cols-2">
                  {/* Engagement Over Time */}
                  {engagementOverTimeData.length >= 2 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Engagement Over Time</CardTitle>
                        <CardDescription>Average engagement rate per platform by month.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={engagementOverTimeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                            <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 'auto']} />
                            <Tooltip formatter={(v: any) => [`${v}%`, '']} labelFormatter={(l) => `Month: ${l}`} />
                            {insightPlatforms.map((pl) => (
                              <Line
                                key={pl}
                                type="monotone"
                                dataKey={pl}
                                stroke={pl === 'INSTAGRAM' ? '#ec4899' : pl === 'LINKEDIN' ? '#2563eb' : '#374151'}
                                dot={false}
                                strokeWidth={2}
                                name={pl === 'INSTAGRAM' ? 'Instagram' : pl === 'LINKEDIN' ? 'LinkedIn' : 'X'}
                                connectNulls
                              />
                            ))}
                            {insightPlatforms.length > 1 && <Legend />}
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Content Type Performance */}
                  {combinedInsights.summary?.contentTypeBreakdown?.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Content Type Performance</CardTitle>
                        <CardDescription>Average engagement rate by content format.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart
                            data={combinedInsights.summary.contentTypeBreakdown.map((ct: any) => ({
                              type: ct.type === 'BLOG_POST' ? 'Blog' : ct.type.charAt(0) + ct.type.slice(1).toLowerCase(),
                              engagement: parseFloat(ct.avgEngagement.toFixed(2)),
                              count: ct.count,
                            }))}
                            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} unit="%" />
                            <Tooltip formatter={(v: any, name: string) => [`${v}%`, 'Avg Engagement']} />
                            <Bar dataKey="engagement" fill="#6366f1" radius={[4, 4, 0, 0]} name="Avg Engagement" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* ---- Cross-Platform Post Performance Table ---- */}
              {combinedInsights?.postTable?.length > 0 ? (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Post Performance</span>
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={postTableSort}
                        onChange={(e) => setPostTableSort(e.target.value)}
                      >
                        <option value="engagement">Sort: Engagement</option>
                        <option value="likes">Sort: Likes</option>
                        <option value="reach">Sort: Reach</option>
                        <option value="date">Sort: Date</option>
                      </select>
                    </CardTitle>
                    <CardDescription>Performance metrics across all published posts and platforms.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                      {(combinedInsights.postTable as any[])
                        .slice()
                        .sort((a: any, b: any) => {
                          if (postTableSort === 'date') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                          const getVal = (p: any, key: string) => {
                            if (!p.platformInsights?.length) return 0;
                            return Math.max(...p.platformInsights.map((i: any) => i[key] ?? 0));
                          };
                          if (postTableSort === 'likes') return getVal(b, 'likes') - getVal(a, 'likes');
                          if (postTableSort === 'reach') return getVal(b, 'reach') - getVal(a, 'reach');
                          return getVal(b, 'engagement') - getVal(a, 'engagement');
                        })
                        .map((post: any) => (
                          <div key={post.postId} className="rounded-lg border p-3">
                            <p className="text-sm font-medium mb-1 line-clamp-2">{post.caption}</p>
                            {post.account && (
                              <p className="text-xs text-muted-foreground mb-2">@{post.account.username} · {post.account.accountType === 'INSTAGRAM' ? 'Instagram' : post.account.accountType === 'LINKEDIN' ? 'LinkedIn' : 'X'}</p>
                            )}
                            {post.platformInsights?.length > 0 ? (
                              <div className="space-y-2">
                                {(post.platformInsights as any[]).map((ins: any) => (
                                  <div key={ins.platform} className="bg-muted/40 rounded p-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className={`text-xs font-semibold ${ins.platform === 'INSTAGRAM' ? 'text-pink-500' : ins.platform === 'LINKEDIN' ? 'text-blue-600' : ''}`}>
                                        {ins.platform === 'INSTAGRAM' ? 'Instagram' : ins.platform === 'LINKEDIN' ? 'LinkedIn' : 'X'}
                                      </span>
                                      <span className="text-xs font-bold text-foreground">{ins.engagement.toFixed(1)}% eng.</span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1 text-center">
                                      <div>
                                        <div className="text-sm font-semibold">{(ins.reach || ins.impressions || 0).toLocaleString()}</div>
                                        <div className="text-xs text-muted-foreground">{ins.reach > 0 ? 'Reach' : 'Views'}</div>
                                      </div>
                                      <div>
                                        <div className="text-sm font-semibold">{ins.likes.toLocaleString()}</div>
                                        <div className="text-xs text-muted-foreground">Likes</div>
                                      </div>
                                      <div>
                                        <div className="text-sm font-semibold">{ins.comments.toLocaleString()}</div>
                                        <div className="text-xs text-muted-foreground">Comments</div>
                                      </div>
                                      <div>
                                        <div className="text-sm font-semibold">{(ins.saves || ins.bookmarks || 0).toLocaleString()}</div>
                                        <div className="text-xs text-muted-foreground">Saves</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">No insights data yet.</p>
                                <Button variant="ghost" size="sm" onClick={() => refreshPostInsights(post.postId)} disabled={isFetchingInsights}>
                                  <RefreshCw className={`h-3 w-3 ${isFetchingInsights ? 'animate-spin' : ''}`} />
                                </Button>
                              </div>
                            )}
                            <div className="mt-2 pt-2 border-t flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => copyPostToDraft(post.postId)}
                                disabled={isCopyingToDraft}
                              >
                                <Copy className="h-3.5 w-3.5 mr-1" /> Copy to Draft
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ) : posts.filter(p => p.status === 'PUBLISHED').length > 0 && !combinedInsights && (
                <Card className="mb-6">
                  <CardContent className="text-center py-8">
                    <p className="text-muted-foreground mb-3">Load insights to see cross-platform post performance.</p>
                    <Button variant="outline" onClick={() => fetchCombinedInsights(insightsPlatformFilter)} disabled={isLoadingCombined}>
                      {isLoadingCombined ? 'Loading...' : 'Load Insights'}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* ---- What's Working (8c) ---- */}
              {combinedInsights && (
                <div className="mb-6 space-y-4">
                  <h3 className="text-lg font-semibold">What's Working</h3>

                  {/* Top performers per platform */}
                  {Object.keys(combinedInsights.topByPlatform ?? {}).length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Top Performing Posts</CardTitle>
                        <CardDescription>Your highest-engagement posts by platform.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(combinedInsights.topByPlatform).map(([platform, topPosts]: [string, any]) => (
                            <div key={platform}>
                              <p className={`text-sm font-semibold mb-2 ${platform === 'INSTAGRAM' ? 'text-pink-500' : platform === 'LINKEDIN' ? 'text-blue-600' : ''}`}>
                                {platform === 'INSTAGRAM' ? 'Instagram' : platform === 'LINKEDIN' ? 'LinkedIn' : 'X'}
                              </p>
                              <div className="space-y-2">
                                {(topPosts as any[]).map((post: any, i: number) => (
                                  <div key={post.postId || i} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                                    <span className="flex-1 mr-4 text-xs line-clamp-1">{post.captionSnippet}</span>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                                      <span>{post.likes?.toLocaleString()} likes</span>
                                      <span className="font-semibold text-foreground">{post.engagement.toFixed(1)}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Hashtag performance */}
                  {(combinedInsights.summary?.hashtagAnalysis?.recommendedHashtags?.length > 0 ||
                    combinedInsights.summary?.hashtagAnalysis?.avoidHashtags?.length > 0) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Hashtag Signals</CardTitle>
                        <CardDescription>Tags correlated with your top and lowest performing posts.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {combinedInsights.summary.hashtagAnalysis.recommendedHashtags?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-green-700 mb-1">Recommended (appear in top posts)</p>
                            <div className="flex flex-wrap gap-1">
                              {combinedInsights.summary.hashtagAnalysis.recommendedHashtags.map((tag: string) => (
                                <span key={tag} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-green-50 text-green-700 border border-green-200">{tag}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {combinedInsights.summary.hashtagAnalysis.avoidHashtags?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-red-700 mb-1">Avoid (appear only in low-performers)</p>
                            <div className="flex flex-wrap gap-1">
                              {combinedInsights.summary.hashtagAnalysis.avoidHashtags.map((tag: string) => (
                                <span key={tag} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-red-50 text-red-700 border border-red-200">{tag}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Best posting times per platform */}
                  {Object.keys(combinedInsights.timingByPlatform ?? {}).some(
                    (pl) => (combinedInsights.timingByPlatform[pl] as any[]).length > 0
                  ) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Best Posting Times</CardTitle>
                        <CardDescription>Hours and days correlated with your highest engagement (UTC).</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(combinedInsights.timingByPlatform).map(([platform, slots]: [string, any]) => {
                            if (!slots?.length) return null;
                            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                            return (
                              <div key={platform}>
                                <p className={`text-sm font-semibold mb-2 ${platform === 'INSTAGRAM' ? 'text-pink-500' : platform === 'LINKEDIN' ? 'text-blue-600' : ''}`}>
                                  {platform === 'INSTAGRAM' ? 'Instagram' : platform === 'LINKEDIN' ? 'LinkedIn' : 'X'}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {(slots as any[]).slice(0, 3).map((slot: any, i: number) => (
                                    <div key={i} className="rounded border px-3 py-1.5 text-center text-xs">
                                      <div className="font-semibold">{days[slot.dayOfWeek]} {slot.hour}:00</div>
                                      <div className="text-muted-foreground">{slot.avgEngagement.toFixed(1)}% avg</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Content type breakdown */}
                  {combinedInsights.summary?.contentTypeBreakdown?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Content Type Performance</CardTitle>
                        <CardDescription>Average engagement by content format.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-4">
                          {combinedInsights.summary.contentTypeBreakdown.map((ct: any) => (
                            <div key={ct.type} className="rounded-lg border p-3 text-center min-w-[100px]">
                              <div className="text-xl font-bold">{ct.avgEngagement.toFixed(1)}%</div>
                              <div className="text-xs font-medium">{ct.type === 'BLOG_POST' ? 'Blog Post' : ct.type.charAt(0) + ct.type.slice(1).toLowerCase()}</div>
                              <div className="text-xs text-muted-foreground">{ct.count} posts</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* ---- What's Not Working (8d) ---- */}
              {combinedInsights && (
                <div className="mb-6 space-y-4">
                  <h3 className="text-lg font-semibold">What's Not Working</h3>

                  {/* Decline Alerts */}
                  {combinedInsights.summary?.declineAlerts?.length > 0 && (
                    <div className="space-y-2">
                      {combinedInsights.summary.declineAlerts.map((alert: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                          <span className="text-amber-600 shrink-0 mt-0.5 font-bold">!</span>
                          <div>
                            <p className="text-sm font-semibold text-amber-800">{alert.platform} engagement down {alert.dropPercent}%</p>
                            <p className="text-xs text-amber-700 mt-0.5">{alert.suggestion}</p>
                            <p className="text-xs text-amber-600 mt-1">This week: {alert.thisWeek}% · Last week: {alert.lastWeek}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Underperformers Panel */}
                  {combinedInsights.summary?.underperformers?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Underperforming Posts</CardTitle>
                        <CardDescription>Bottom 20% by engagement in the last 90 days — with detected issues.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {combinedInsights.summary.underperformers.map((post: any) => (
                            <div key={post.id} className="rounded-lg border p-3">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="text-sm line-clamp-2 flex-1">{post.captionSnippet}</p>
                                <span className={`text-xs shrink-0 ${post.platform === 'INSTAGRAM' ? 'text-pink-500' : post.platform === 'LINKEDIN' ? 'text-blue-600' : ''}`}>
                                  {post.platform}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
                                <span className="text-red-600 font-semibold">{post.engagement.toFixed(1)}% eng.</span>
                                <span>avg: {post.avgEngagement.toFixed(1)}%</span>
                                <span>{post.likes} likes</span>
                                <span>{post.reach.toLocaleString()} reach</span>
                              </div>
                              <div className="flex flex-wrap gap-1 mb-2">
                                {post.failureModes.map((mode: string, i: number) => (
                                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">{mode}</span>
                                ))}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => { setRefinePostId(post.id); setRefineResult(null); }}
                              >
                                AI Refine This Post
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {combinedInsights.summary?.underperformers?.length === 0 && combinedInsights.summary?.declineAlerts?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No underperformers detected yet. Load insights to analyze your posts.</p>
                  )}
                </div>
              )}

              {/* ---- Post Refinement Panel (8e) ---- */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>AI Post Refinement</span>
                  </CardTitle>
                  <CardDescription>
                    Browse your published posts by performance, select one to compare engagement, and get AI-powered caption rewrites, hashtag suggestions, or media improvement tips.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!combinedInsights ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <p className="text-sm mb-3">Load insights to see post performance data and pick posts for refinement.</p>
                      <Button variant="outline" size="sm" onClick={() => fetchCombinedInsights(insightsPlatformFilter)} disabled={isLoadingCombined}>
                        {isLoadingCombined ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Loading...</> : 'Load Insights'}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Browse controls */}
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap">Show</Label>
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                            value={refinePostCount}
                            onChange={(e) => setRefinePostCount(Number(e.target.value))}
                          >
                            <option value={5}>5 posts</option>
                            <option value={10}>10 posts</option>
                            <option value={25}>25 posts</option>
                            <option value={50}>50 posts</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap">Sort by</Label>
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                            value={refinePostSort}
                            onChange={(e) => setRefinePostSort(e.target.value)}
                          >
                            <option value="engagement">Engagement</option>
                            <option value="likes">Likes</option>
                            <option value="reach">Reach</option>
                            <option value="date">Date</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                            value={refinePostSortDir}
                            onChange={(e) => setRefinePostSortDir(e.target.value as 'desc' | 'asc')}
                          >
                            <option value="desc">{refinePostSort === 'date' ? 'Newest first' : 'High → Low'}</option>
                            <option value="asc">{refinePostSort === 'date' ? 'Oldest first' : 'Low → High'}</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                          <span className="text-xs text-muted-foreground">
                            {combinedInsights.postTable?.length ?? 0} posts ({combinedInsights.postTable?.filter((p: any) => p.platformInsights?.length > 0).length ?? 0} with insights)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => syncIgPosts(refinePostCount)}
                            disabled={isSyncingIgPosts}
                          >
                            {isSyncingIgPosts ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Sync IG Posts'}
                          </Button>
                        </div>
                      </div>

                      {/* Post cards */}
                      {(combinedInsights.postTable?.length ?? 0) > 0 ? (
                        <div className="space-y-2 mb-4 max-h-[28rem] overflow-y-auto pr-1">
                          {(combinedInsights.postTable as any[])
                            .sort((a: any, b: any) => {
                              const getVal = (p: any) => {
                                const ins = p.platformInsights?.[0];
                                if (!ins) return 0;
                                if (refinePostSort === 'engagement') return ins.engagement ?? 0;
                                if (refinePostSort === 'likes') return ins.likes ?? 0;
                                if (refinePostSort === 'reach') return ins.reach ?? 0;
                                if (refinePostSort === 'date') return new Date(p.scheduledFor ?? p.updatedAt).getTime();
                                return 0;
                              };
                              return refinePostSortDir === 'asc' ? getVal(a) - getVal(b) : getVal(b) - getVal(a);
                            })
                            .slice(0, refinePostCount)
                            .map((post: any) => {
                              const ins = post.platformInsights?.[0];
                              const isSelected = refinePostId === post.postId;
                              const engColor = !ins ? '' : ins.engagement < 1 ? 'text-red-600' : ins.engagement < 3 ? 'text-amber-600' : 'text-green-600';
                              return (
                                <div
                                  key={post.postId}
                                  onClick={() => { setRefinePostId(isSelected ? '' : post.postId); setRefineResult(null); }}
                                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/40'}`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        {post.account && (
                                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium uppercase tracking-wide">
                                            {post.account.accountType}
                                          </span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                          {post.updatedAt ? new Date(post.updatedAt).toLocaleDateString() : ''}
                                        </span>
                                        {isSelected && <span className="text-xs text-primary font-medium ml-auto">Selected</span>}
                                      </div>
                                      <p className="text-sm line-clamp-2 leading-snug">{post.caption}</p>
                                    </div>
                                    {ins && (
                                      <div className="flex-shrink-0 text-right">
                                        <div className={`text-lg font-bold leading-none ${engColor}`}>
                                          {ins.engagement?.toFixed(1)}%
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">engagement</div>
                                      </div>
                                    )}
                                  </div>
                                  {ins && (
                                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground border-t pt-2">
                                      <span><span className="font-medium text-foreground">{ins.likes?.toLocaleString() ?? 0}</span> likes</span>
                                      <span><span className="font-medium text-foreground">{ins.comments?.toLocaleString() ?? 0}</span> comments</span>
                                      <span><span className="font-medium text-foreground">{ins.reach?.toLocaleString() ?? 0}</span> reach</span>
                                      {ins.saves > 0 && <span><span className="font-medium text-foreground">{ins.saves?.toLocaleString()}</span> saves</span>}
                                    </div>
                                  )}
                                  <div className="flex justify-end mt-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-xs"
                                      onClick={(e) => { e.stopPropagation(); copyPostToDraft(post.postId); }}
                                      disabled={isCopyingToDraft}
                                    >
                                      <Copy className="h-3 w-3 mr-1" /> Copy to Draft
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 mb-4 text-center">
                          <p className="text-sm text-muted-foreground mb-1">No published posts with insights found.</p>
                          <p className="text-xs text-muted-foreground mb-3">
                            Posts made directly on Instagram need to be synced first. Click below to import your Instagram posts and fetch their insights.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => syncIgPosts(refinePostCount)}
                            disabled={isSyncingIgPosts}
                          >
                            {isSyncingIgPosts ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Syncing...</> : 'Sync Instagram Posts'}
                          </Button>
                          {syncResult && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Imported {syncResult.imported} posts, fetched insights for {syncResult.insightsFetched}.
                              {syncResult.errors?.length > 0 && ` (${syncResult.errors.length} errors)`}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Refinement controls — shown only when a post is selected */}
                      {refinePostId && (
                        <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
                          <p className="text-xs font-semibold">Refinement Options</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <Label className="text-xs mb-1 block">Type</Label>
                              <select
                                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                value={refineType}
                                onChange={(e) => setRefineType(e.target.value)}
                              >
                                <option value="caption">Rewrite Caption</option>
                                <option value="hashtags">Optimize Hashtags</option>
                                <option value="media_suggestion">Media Suggestions</option>
                              </select>
                            </div>
                            {refineType === 'caption' && (
                              <div>
                                <Label className="text-xs mb-1 block">Tone</Label>
                                <select
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  value={refineTone}
                                  onChange={(e) => setRefineTone(e.target.value)}
                                >
                                  <option value="casual">Casual</option>
                                  <option value="professional">Professional</option>
                                  <option value="storytelling">Storytelling</option>
                                  <option value="direct_cta">Direct CTA</option>
                                </select>
                              </div>
                            )}
                          </div>
                          <Button
                            onClick={() => refinePost(refinePostId)}
                            disabled={isRefining}
                          >
                            {isRefining ? <><RefreshCw className="h-4 w-4 animate-spin mr-2" />Refining...</> : 'Generate Refinement'}
                          </Button>
                        </div>
                      )}

                      {/* Results */}
                      {refineResult && (
                        <div className="mt-4 space-y-3">
                          {refineResult.insight && (
                            <div className="text-xs text-muted-foreground">
                              This post: <span className="text-red-600 font-semibold">{refineResult.insight.engagement.toFixed(1)}% eng.</span> · Your average: <span className="font-semibold">{refineResult.insight.avgEngagement.toFixed(1)}%</span>
                            </div>
                          )}
                          {refineResult.refinedCaption && (
                            <div>
                              <p className="text-xs font-semibold mb-1">Refined Caption:</p>
                              <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{refineResult.refinedCaption}</div>
                              {refineResult.explanation && <p className="text-xs text-muted-foreground mt-1">{refineResult.explanation}</p>}
                              {refineResult.keyImprovements?.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {refineResult.keyImprovements.map((imp: string, i: number) => (
                                    <div key={i} className="text-xs flex items-start gap-1.5"><span className="text-green-600">✓</span>{imp}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {refineResult.suggestedHashtags?.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold mb-1">Suggested Hashtags:</p>
                              <div className="flex flex-wrap gap-1">
                                {refineResult.suggestedHashtags.map((tag: string, i: number) => (
                                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {refineResult.suggestions?.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold">Media Suggestions:</p>
                              {refineResult.suggestions.map((s: string, i: number) => (
                                <div key={i} className="text-xs flex items-start gap-1.5"><span className="text-amber-600">•</span>{s}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ---- A/B Test Tracker (8e) ---- */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>A/B Test Tracker</span>
                    <Button variant="outline" size="sm" onClick={loadABTests} disabled={isLoadingABTests}>
                      {isLoadingABTests ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                  </CardTitle>
                  <CardDescription>Compare two posts side-by-side to see which caption, image, or timing performed better.</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Create new test */}
                  <div className="rounded-lg border p-3 mb-4">
                    <p className="text-sm font-medium mb-2">New A/B Test</p>
                    <div className="grid gap-2 sm:grid-cols-2 mb-2">
                      <div>
                        <Label className="text-xs mb-1 block">Post A</Label>
                        <select
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={newABTest.postAId}
                          onChange={(e) => setNewABTest({ ...newABTest, postAId: e.target.value })}
                        >
                          <option value="">Select Post A</option>
                          {posts.filter(p => p.status === 'PUBLISHED').map(p => (
                            <option key={p.id} value={p.id}>{p.caption.slice(0, 40)}...</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Post B</Label>
                        <select
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={newABTest.postBId}
                          onChange={(e) => setNewABTest({ ...newABTest, postBId: e.target.value })}
                        >
                          <option value="">Select Post B</option>
                          {posts.filter(p => p.status === 'PUBLISHED' && p.id !== newABTest.postAId).map(p => (
                            <option key={p.id} value={p.id}>{p.caption.slice(0, 40)}...</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Input
                      placeholder="Notes (optional — what are you testing?)"
                      className="mb-2 text-sm"
                      value={newABTest.notes}
                      onChange={(e) => setNewABTest({ ...newABTest, notes: e.target.value })}
                    />
                    <Button size="sm" onClick={createABTest} disabled={!newABTest.postAId || !newABTest.postBId}>
                      Create A/B Test
                    </Button>
                  </div>

                  {/* Existing tests */}
                  {abTests.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No A/B tests yet. Click refresh to load or create one above.</p>
                  ) : (
                    <div className="space-y-4">
                      {abTests.map((test: any) => (
                        <div key={test.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${test.status === 'concluded' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {test.status === 'concluded' ? 'Concluded' : 'Active'}
                              </span>
                              {test.notes && <span className="text-xs text-muted-foreground ml-2">{test.notes}</span>}
                            </div>
                            <span className="text-xs text-muted-foreground">{new Date(test.createdAt).toLocaleDateString()}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {[{ post: test.postA, label: 'A', id: test.postAId }, { post: test.postB, label: 'B', id: test.postBId }].map(({ post, label, id }) => (
                              <div key={label} className={`rounded border p-2 ${test.winnerId === id ? 'border-green-500 bg-green-50' : ''}`}>
                                <div className="flex items-center gap-1 mb-1">
                                  <span className="text-xs font-bold">Post {label}</span>
                                  {test.winnerId === id && <span className="text-xs text-green-700 font-semibold">Winner</span>}
                                </div>
                                {post ? (
                                  <>
                                    <p className="text-xs line-clamp-2 mb-1">{post.caption}</p>
                                    {post.insight ? (
                                      <div className="grid grid-cols-2 gap-1 text-xs text-center">
                                        <div><div className="font-bold">{post.insight.engagement.toFixed(1)}%</div><div className="text-muted-foreground">Eng.</div></div>
                                        <div><div className="font-bold">{post.insight.likes}</div><div className="text-muted-foreground">Likes</div></div>
                                      </div>
                                    ) : <p className="text-xs text-muted-foreground">No insights yet</p>}
                                  </>
                                ) : <p className="text-xs text-muted-foreground">Post not found</p>}
                              </div>
                            ))}
                          </div>
                          {test.status !== 'concluded' && test.postA?.insight && test.postB?.insight && (
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => markABWinner(test.id, test.postAId)}>Mark A as Winner</Button>
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => markABWinner(test.id, test.postBId)}>Mark B as Winner</Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

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
                  <div className="mb-3">
                    <Label className="text-xs text-muted-foreground mb-2 block">Search in:</Label>
                    <ToggleGroup
                      type="multiple"
                      value={searchFilters}
                      onValueChange={(value) => {
                        if (value.length > 0) setSearchFilters(value);
                      }}
                      variant="outline"
                      size="sm"
                      className="justify-start flex-wrap"
                    >
                      <ToggleGroupItem value="for_you" className="text-xs">For you</ToggleGroupItem>
                      <ToggleGroupItem value="accounts" className="text-xs">Accounts</ToggleGroupItem>
                      <ToggleGroupItem value="audio" className="text-xs">Audio</ToggleGroupItem>
                      <ToggleGroupItem value="tags" className="text-xs">Tags</ToggleGroupItem>
                      <ToggleGroupItem value="places" className="text-xs">Places</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={searchFilters.includes('accounts') && searchFilters.length === 1 ? 'Look up an account (e.g. natgeo)...' : 'Search hashtags, topics, accounts...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => { if (e.key === 'Enter') handleInstagramSearch(); }}
                      className="flex-1"
                    />
                    <Button onClick={handleInstagramSearch} disabled={isSearching}>
                      {isSearching ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Searching...</> : "Search"}
                    </Button>
                  </div>
                  {searchFilters.some(f => ['for_you', 'tags', 'audio', 'places'].includes(f)) && (
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
                          {post.audioName && (
                            <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
                              <span>🎵</span>
                              <span>{post.audioName}{post.audioArtist ? ` · ${post.audioArtist}` : ''}</span>
                            </div>
                          )}
                          {post.placeName && (
                            <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
                              <span>📍</span>
                              <span>{post.placeName}</span>
                            </div>
                          )}
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
                      {searchFilters.length === 1 && searchFilters[0] === 'accounts' ? 'Account must be a Business or Creator account to be discoverable.' : 'Try a different search term or adjust your filters.'}
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
                              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setSearchFilters(['accounts']); setSearchQuery(comp.username); handleInstagramSearch(); }}>
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

            <TabsContent value="outreach">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Outreach</h2>
                <Button onClick={() => setIsAddingContact(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Contact
                </Button>
              </div>

              {/* Outreach Funnel Stats */}
              {outreachStats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  {[
                    { label: 'Prospects', value: outreachStats.contactsByStatus?.PROSPECT || 0, color: 'bg-gray-100 text-gray-800' },
                    { label: 'Contacted', value: outreachStats.contactsByStatus?.CONTACTED || 0, color: 'bg-blue-100 text-blue-800' },
                    { label: 'Responded', value: outreachStats.contactsByStatus?.RESPONDED || 0, color: 'bg-green-100 text-green-800' },
                    { label: 'Converted', value: outreachStats.contactsByStatus?.CONVERTED || 0, color: 'bg-purple-100 text-purple-800' },
                    { label: 'Response Rate', value: outreachStats.responseRate != null ? `${(outreachStats.responseRate * 100).toFixed(0)}%` : 'N/A', color: 'bg-orange-100 text-orange-800' },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg border p-3 text-center">
                      <div className="text-2xl font-bold">{s.value}</div>
                      <div className={`text-xs inline-flex rounded-full px-2 py-0.5 mt-1 ${s.color}`}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Contact Dialog */}
              <Dialog open={isAddingContact} onOpenChange={setIsAddingContact}>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Add Contact</DialogTitle>
                    <DialogDescription>Add a person to your outreach list.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-4">
                    <div className="grid gap-1">
                      <Label>Instagram Username *</Label>
                      <Input placeholder="@username" value={newContact.igUsername} onChange={e => setNewContact({ ...newContact, igUsername: e.target.value })} />
                    </div>
                    <div className="grid gap-1">
                      <Label>Display Name</Label>
                      <Input placeholder="Their name" value={newContact.displayName} onChange={e => setNewContact({ ...newContact, displayName: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1">
                        <Label>Niche</Label>
                        <Input placeholder="e.g. fitness" value={newContact.niche} onChange={e => setNewContact({ ...newContact, niche: e.target.value })} />
                      </div>
                      <div className="grid gap-1">
                        <Label>Location</Label>
                        <Input placeholder="e.g. NYC" value={newContact.location} onChange={e => setNewContact({ ...newContact, location: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <Label>Notes</Label>
                      <Textarea placeholder="Why you want to reach out..." value={newContact.notes} onChange={e => setNewContact({ ...newContact, notes: e.target.value })} className="min-h-[60px]" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddingContact(false)}>Cancel</Button>
                    <Button onClick={addContact}>Add Contact</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Contact Filters */}
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Search contacts..."
                  value={contactSearch}
                  onChange={e => { setContactSearch(e.target.value); fetchContacts(contactFilter, e.target.value); }}
                  className="max-w-xs"
                />
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={contactFilter}
                  onChange={e => { setContactFilter(e.target.value); fetchContacts(e.target.value, contactSearch); }}
                >
                  <option value="">All Statuses</option>
                  <option value="PROSPECT">Prospects</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="RESPONDED">Responded</option>
                  <option value="CONVERTED">Converted</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              {/* Contact List + Detail View */}
              <div className="grid gap-6 md:grid-cols-3">
                {/* Contact List */}
                <div className="md:col-span-1 space-y-2">
                  {contacts.length === 0 ? (
                    <Card>
                      <CardContent className="text-center py-8">
                        <p className="text-sm text-muted-foreground mb-2">No contacts yet.</p>
                        <Button variant="outline" size="sm" onClick={() => setIsAddingContact(true)}>Add your first contact</Button>
                      </CardContent>
                    </Card>
                  ) : (
                    contacts.map((contact: any) => (
                      <div
                        key={contact.id}
                        className={`rounded-lg border p-3 cursor-pointer transition-colors ${selectedContact?.id === contact.id ? 'border-primary bg-muted/50' : 'hover:bg-muted/30'}`}
                        onClick={() => { setSelectedContact(contact); fetchContactMessages(contact.id); }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">@{contact.igUsername}</p>
                            {contact.displayName && <p className="text-xs text-muted-foreground">{contact.displayName}</p>}
                          </div>
                          <span className={`text-xs rounded-full px-2 py-0.5 ${
                            contact.status === 'PROSPECT' ? 'bg-gray-100 text-gray-700' :
                            contact.status === 'CONTACTED' ? 'bg-blue-100 text-blue-700' :
                            contact.status === 'RESPONDED' ? 'bg-green-100 text-green-700' :
                            contact.status === 'CONVERTED' ? 'bg-purple-100 text-purple-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {contact.status}
                          </span>
                        </div>
                        <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                          {contact.niche && <span>{contact.niche}</span>}
                          {contact.location && <span>{contact.location}</span>}
                          {contact._count?.outreachMessages > 0 && <span>{contact._count.outreachMessages} msgs</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Contact Detail + Messages */}
                <div className="md:col-span-2">
                  {!selectedContact ? (
                    <Card>
                      <CardContent className="text-center py-12">
                        <p className="text-muted-foreground">Select a contact to view details and manage messages.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {/* Contact Info */}
                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">@{selectedContact.igUsername}</CardTitle>
                            <div className="flex gap-2">
                              <select
                                className="h-8 rounded border text-xs"
                                value={selectedContact.status}
                                onChange={e => updateContactStatus(selectedContact.id, e.target.value)}
                              >
                                <option value="PROSPECT">Prospect</option>
                                <option value="CONTACTED">Contacted</option>
                                <option value="RESPONDED">Responded</option>
                                <option value="CONVERTED">Converted</option>
                                <option value="INACTIVE">Inactive</option>
                              </select>
                              <Button variant="ghost" size="sm" className="text-destructive h-8" onClick={() => deleteContact(selectedContact.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {selectedContact.displayName && <div><span className="text-muted-foreground">Name:</span> {selectedContact.displayName}</div>}
                            {selectedContact.niche && <div><span className="text-muted-foreground">Niche:</span> {selectedContact.niche}</div>}
                            {selectedContact.location && <div><span className="text-muted-foreground">Location:</span> {selectedContact.location}</div>}
                            {selectedContact.followerCount != null && <div><span className="text-muted-foreground">Followers:</span> {selectedContact.followerCount.toLocaleString()}</div>}
                            {selectedContact.bio && <div className="col-span-2"><span className="text-muted-foreground">Bio:</span> {selectedContact.bio}</div>}
                            {selectedContact.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {selectedContact.notes}</div>}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Generate Message */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Generate Message</CardTitle>
                          <CardDescription>AI will create a personalized DM based on this contact's profile.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex gap-2 mb-2">
                            <select
                              className="h-9 rounded-md border border-input bg-background px-3 text-sm flex-1"
                              value={messageTemplateType}
                              onChange={e => setMessageTemplateType(e.target.value)}
                            >
                              <option value="introduction">Introduction</option>
                              <option value="collaboration">Collaboration Request</option>
                              <option value="product_pitch">Product Pitch</option>
                              <option value="follow_up">Follow Up</option>
                            </select>
                            <Button
                              size="sm"
                              onClick={() => generateOutreachMessage(selectedContact.id)}
                              disabled={isGeneratingMessage}
                            >
                              {isGeneratingMessage ? <><RefreshCw className="h-4 w-4 animate-spin mr-1" />Generating...</> : "Generate"}
                            </Button>
                          </div>
                          <Input
                            placeholder="Custom instructions (optional)..."
                            value={customMessageInstructions}
                            onChange={e => setCustomMessageInstructions(e.target.value)}
                            className="text-sm"
                          />
                        </CardContent>
                      </Card>

                      {/* Messages List */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Messages ({outreachMessages.length})</CardTitle>
                          <CardDescription>Draft and track messages to this contact. Copy message text and send manually via Instagram.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                          {outreachMessages.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No messages yet. Generate one above.</p>
                          ) : (
                            outreachMessages.map((msg: any) => (
                              <div key={msg.id} className="rounded-lg border p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    {msg.templateName && <span className="text-xs bg-muted px-2 py-0.5 rounded">{msg.templateName}</span>}
                                    <span className={`text-xs rounded-full px-2 py-0.5 ${
                                      msg.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-700' :
                                      msg.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
                                      msg.status === 'REPLIED' ? 'bg-green-100 text-green-700' :
                                      'bg-red-100 text-red-700'
                                    }`}>{msg.status}</span>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => {
                                      navigator.clipboard.writeText(msg.messageBody);
                                      toast({ title: "Copied", description: "Message copied to clipboard" });
                                    }}>
                                      Copy
                                    </Button>
                                    {msg.status === 'DRAFT' && (
                                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => updateMessageStatus(msg.id, 'SENT')}>
                                        Mark Sent
                                      </Button>
                                    )}
                                    {msg.status === 'SENT' && (
                                      <>
                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-green-600" onClick={() => updateMessageStatus(msg.id, 'REPLIED')}>
                                          Got Reply
                                        </Button>
                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-orange-600" onClick={() => updateMessageStatus(msg.id, 'NO_REPLY')}>
                                          No Reply
                                        </Button>
                                      </>
                                    )}
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => deleteMessage(msg.id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-sm whitespace-pre-wrap">{msg.messageBody}</p>
                                <div className="text-xs text-muted-foreground mt-2">
                                  {new Date(msg.createdAt).toLocaleDateString()}
                                  {msg.sentAt && ` / Sent: ${new Date(msg.sentAt).toLocaleDateString()}`}
                                  {msg.responseReceivedAt && ` / Reply: ${new Date(msg.responseReceivedAt).toLocaleDateString()}`}
                                </div>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              </div>

              {/* Find Instagram Prospects */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-base">Find Instagram Prospects</CardTitle>
                  <CardDescription>
                    Discover and evaluate Instagram accounts for cold outreach. Search by username, hashtag, or place. Requires a connected Instagram Business or Creator account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {/* Search mode toggle */}
                    <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit text-sm flex-wrap">
                      {(['username', 'hashtag', 'place', 'location'] as const).map(mode => (
                        <button
                          key={mode}
                          className={`px-3 py-1.5 rounded-md transition-colors ${igProspectSearchMode === mode ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                          onClick={() => setIgProspectSearchMode(mode)}
                        >
                          {mode === 'username' ? 'Username' : mode === 'hashtag' ? 'Hashtag' : mode === 'place' ? 'Place tag' : 'Location'}
                        </button>
                      ))}
                    </div>

                    {/* Query input — changes based on mode */}
                    <div className="grid gap-1">
                      <Label>
                        {igProspectSearchMode === 'username' ? 'Instagram Username(s)' :
                         igProspectSearchMode === 'hashtag' ? 'Hashtag' :
                         igProspectSearchMode === 'place' ? 'Place Name' :
                         'Business / Venue'}
                      </Label>
                      {igProspectSearchMode === 'username' ? (
                        <Textarea
                          placeholder="username1, username2, username3"
                          value={igProspectUsernames}
                          onChange={e => setIgProspectUsernames(e.target.value)}
                          className="min-h-[60px] text-sm"
                        />
                      ) : (
                        <Input
                          placeholder={
                            igProspectSearchMode === 'hashtag' ? 'e.g. fitness or #yoga' :
                            igProspectSearchMode === 'place' ? 'e.g. New York City' :
                            'e.g. yoga studio Brooklyn, NYC coffee shop'
                          }
                          value={igProspectQuery}
                          onChange={e => setIgProspectQuery(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') searchIGProspects(); }}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">
                        {igProspectSearchMode === 'username' && 'Comma-separated, up to 10. @ optional.'}
                        {igProspectSearchMode === 'hashtag' && 'Finds accounts posting top content with this hashtag. # optional.'}
                        {igProspectSearchMode === 'place' && 'Searches the place name as a hashtag (e.g. "New York" → #newyork).'}
                        {igProspectSearchMode === 'location' && 'Searches the Facebook business directory for venues/pages matching your query, then returns their connected Instagram accounts.'}
                      </p>
                    </div>

                    {/* Basic filters */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="grid gap-1">
                        <Label>Target Niche</Label>
                        <Input placeholder="e.g. fitness" value={igProspectNiche} onChange={e => setIgProspectNiche(e.target.value)} />
                      </div>
                      <div className="grid gap-1">
                        <Label>Min Followers</Label>
                        <Input type="number" placeholder="e.g. 5000" value={igProspectFollowerMin} onChange={e => setIgProspectFollowerMin(e.target.value)} />
                      </div>
                      <div className="grid gap-1">
                        <Label>Max Followers</Label>
                        <Input type="number" placeholder="e.g. 100000" value={igProspectFollowerMax} onChange={e => setIgProspectFollowerMax(e.target.value)} />
                      </div>
                    </div>

                    {/* Advanced filters toggle */}
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"
                      onClick={() => setIgProspectShowAdvancedFilters(!igProspectShowAdvancedFilters)}
                    >
                      <span>{igProspectShowAdvancedFilters ? '▲' : '▼'}</span> Advanced Filters
                    </button>

                    {igProspectShowAdvancedFilters && (
                      <div className="grid gap-3 p-3 bg-muted/40 rounded-lg border">
                        {/* Profile filters */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid gap-1">
                            <Label>Min Posts</Label>
                            <Input type="number" placeholder="e.g. 12" value={igProspectMinPosts} onChange={e => setIgProspectMinPosts(e.target.value)} />
                          </div>
                          <div className="grid gap-1">
                            <Label>Max Following</Label>
                            <Input type="number" placeholder="e.g. 2000" value={igProspectMaxFollowing} onChange={e => setIgProspectMaxFollowing(e.target.value)} />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="ig-has-website"
                            checked={igProspectHasWebsite}
                            onChange={e => setIgProspectHasWebsite(e.target.checked)}
                            className="h-4 w-4 rounded border"
                          />
                          <Label htmlFor="ig-has-website" className="text-sm font-normal cursor-pointer">Has website link in bio</Label>
                        </div>

                        {/* Profile image analysis */}
                        <div className="border-t pt-3 grid gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="ig-analyze-image"
                              checked={igProspectAnalyzeImage}
                              onChange={e => setIgProspectAnalyzeImage(e.target.checked)}
                              className="h-4 w-4 rounded border"
                            />
                            <Label htmlFor="ig-analyze-image" className="text-sm font-normal cursor-pointer">
                              Analyze profile pictures with AI
                            </Label>
                            <span className="text-xs text-muted-foreground">(uses OpenAI Vision · estimates age & gender)</span>
                          </div>

                          {igProspectAnalyzeImage && (
                            <div className="grid grid-cols-2 gap-3 pl-6">
                              <div className="grid gap-1">
                                <Label>Filter by Age Range</Label>
                                <select
                                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  value={igProspectTargetAgeRange}
                                  onChange={e => setIgProspectTargetAgeRange(e.target.value)}
                                >
                                  <option value="any">Any age</option>
                                  <option value="under-18">Under 18</option>
                                  <option value="18-24">18 – 24</option>
                                  <option value="25-34">25 – 34</option>
                                  <option value="35-44">35 – 44</option>
                                  <option value="45-54">45 – 54</option>
                                  <option value="55+">55+</option>
                                </select>
                              </div>
                              <div className="grid gap-1">
                                <Label>Filter by Gender</Label>
                                <select
                                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  value={igProspectTargetGender}
                                  onChange={e => setIgProspectTargetGender(e.target.value)}
                                >
                                  <option value="any">Any</option>
                                  <option value="female">Female presentation</option>
                                  <option value="male">Male presentation</option>
                                  <option value="non-binary">Non-binary</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={searchIGProspects}
                      disabled={igProspectLoading || !(igProspectSearchMode === 'username' ? igProspectUsernames.trim() : igProspectQuery.trim())}
                      title={igProspectSearchMode === 'location' ? 'Searches Facebook\'s business directory for Instagram accounts at this location' : undefined}
                      className="w-full sm:w-auto"
                    >
                      {igProspectLoading
                        ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Analyzing...</>
                        : <><Search className="mr-2 h-4 w-4" />Find Prospects</>
                      }
                    </Button>

                    {igProspectError && (
                      <p className="text-sm text-destructive">{igProspectError}</p>
                    )}
                  </div>

                  {/* Profile results */}
                  {igProspectResults.length > 0 && (
                    <div className="mt-5 space-y-3">
                      <p className="text-sm font-medium">{igProspectResults.length} account{igProspectResults.length !== 1 ? 's' : ''} found</p>
                      {igProspectResults.map((prospect: any) => (
                        <div key={prospect.username} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              {/* Header row: username, name, score */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">@{prospect.username}</span>
                                {prospect.name && <span className="text-sm text-muted-foreground">{prospect.name}</span>}
                                <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                                  prospect.score >= 7 ? 'bg-green-100 text-green-800' :
                                  prospect.score >= 4 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {prospect.score}/10
                                </span>
                                {prospect.website && (
                                  <span className="text-xs bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">has website</span>
                                )}
                                {prospect.locationName && (
                                  <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                                    {prospect.locationName}{prospect.locationCity ? ` · ${prospect.locationCity}` : ''}
                                  </span>
                                )}
                              </div>

                              {/* Stats */}
                              <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                                <span>{prospect.followers?.toLocaleString() || 0} followers</span>
                                {prospect.following > 0 && <span>{prospect.following?.toLocaleString()} following</span>}
                                {prospect.engagementRate !== null && <span>{prospect.engagementRate}% eng.</span>}
                                {prospect.mediaCount > 0 && <span>{prospect.mediaCount} posts</span>}
                              </div>

                              {/* Image analysis badges */}
                              {prospect.imageAnalysis && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {prospect.imageAnalysis.isPersonPhoto === false && (
                                    <span className="text-xs bg-purple-50 text-purple-700 rounded px-1.5 py-0.5">brand / logo</span>
                                  )}
                                  {prospect.imageAnalysis.estimatedAgeRange && (
                                    <span className="text-xs bg-orange-50 text-orange-700 rounded px-1.5 py-0.5">
                                      age ~{prospect.imageAnalysis.estimatedAgeRange}
                                    </span>
                                  )}
                                  {prospect.imageAnalysis.genderPresentation && prospect.imageAnalysis.genderPresentation !== 'unclear' && (
                                    <span className="text-xs bg-pink-50 text-pink-700 rounded px-1.5 py-0.5">
                                      {prospect.imageAnalysis.genderPresentation}
                                    </span>
                                  )}
                                  {prospect.imageAnalysis.imageQuality === 'professional' && (
                                    <span className="text-xs bg-green-50 text-green-700 rounded px-1.5 py-0.5">professional photo</span>
                                  )}
                                </div>
                              )}

                              {/* Bio */}
                              {prospect.bio && (
                                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{prospect.bio}</p>
                              )}

                              {/* AI analysis */}
                              {prospect.aiSummary && (
                                <p className="text-xs mt-1.5 text-foreground/80 italic">{prospect.aiSummary}</p>
                              )}
                              {prospect.aiSuggestedAngle && (
                                <p className="text-xs mt-0.5 text-blue-700 dark:text-blue-400">Angle: {prospect.aiSuggestedAngle}</p>
                              )}

                              {/* Recent post captions */}
                              {prospect.recentPosts?.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {prospect.recentPosts.slice(0, 2).map((post: any, i: number) => (
                                    post.caption && (
                                      <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[220px]">
                                        {post.caption.slice(0, 55)}{post.caption.length > 55 ? '…' : ''}
                                      </span>
                                    )
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-1.5 shrink-0 items-end">
                              <Button
                                size="sm"
                                variant={prospect.added ? 'outline' : 'default'}
                                disabled={prospect.added}
                                onClick={() => addIGProspectAsContact(prospect)}
                                className="h-8 text-xs"
                              >
                                <UserPlus className="h-3 w-3 mr-1" />
                                {prospect.added ? 'Added' : 'Add to Contacts'}
                              </Button>
                              <a
                                href={`https://www.instagram.com/${prospect.username}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:underline"
                              >
                                View profile
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Discovered posts (hashtag/place — username not resolvable) */}
                  {igProspectDiscoveredPosts.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-1">{igProspectDiscoveredPosts.length} post{igProspectDiscoveredPosts.length !== 1 ? 's' : ''} found · account info unavailable</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        These posts matched your search but Instagram did not return the account username. Click the links to view on Instagram and note any accounts you want to add manually.
                      </p>
                      <div className="space-y-2">
                        {igProspectDiscoveredPosts.slice(0, 6).map((post: any) => (
                          <div key={post.id} className="rounded-lg border p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{post.caption || '(no caption)'}</p>
                              <a
                                href={post.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline shrink-0"
                              >
                                View post →
                              </a>
                            </div>
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                              <span>♥ {post.likes?.toLocaleString()}</span>
                              <span>💬 {post.comments?.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Discovered places (location mode — no connected IG account) */}
                  {igProspectDiscoveredPlaces.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-1">{igProspectDiscoveredPlaces.length} place{igProspectDiscoveredPlaces.length !== 1 ? 's' : ''} matched · no Instagram account connected</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        These businesses/venues matched your search but haven't connected an Instagram account to their Facebook Page. Try searching their name in Username mode if they have an Instagram account.
                      </p>
                      <div className="space-y-1">
                        {igProspectDiscoveredPlaces.slice(0, 10).map((place: any) => (
                          <div key={place.id} className="flex items-center gap-2 text-xs py-0.5 border-b last:border-0">
                            <span className="font-medium">{place.name}</span>
                            {(place.city || place.country) && (
                              <span className="text-muted-foreground">{[place.city, place.country].filter(Boolean).join(', ')}</span>
                            )}
                            {place.category && (
                              <span className="bg-muted px-1.5 py-0.5 rounded">{place.category}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Search Criteria Section */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-base">Search Criteria Templates</CardTitle>
                  <CardDescription>Save criteria to help find potential contacts to add to your outreach list.</CardDescription>
                </CardHeader>
                <CardContent>
                  {outreachCriteria.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No saved criteria yet.</p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                      {outreachCriteria.map((c: any) => (
                        <div key={c.id} className="rounded-lg border p-3">
                          <div className="flex justify-between items-start">
                            <p className="font-medium text-sm">{c.name}</p>
                            <Button variant="ghost" size="sm" className="h-6 px-1 text-destructive" onClick={async () => {
                              await fetch('/api/outreach/criteria', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }), credentials: 'include' });
                              setOutreachCriteria(outreachCriteria.filter(x => x.id !== c.id));
                            }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(c.searchTerms || []).map((t: string, i: number) => <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{t}</span>)}
                            {(c.niches || []).map((n: string, i: number) => <span key={i} className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{n}</span>)}
                            {(c.locations || []).map((l: string, i: number) => <span key={i} className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">{l}</span>)}
                          </div>
                          {(c.followerMin || c.followerMax) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Followers: {c.followerMin?.toLocaleString() || '0'} - {c.followerMax?.toLocaleString() || 'any'}
                            </p>
                          )}
                          {c.notes && <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
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
        {/* Global multi-platform publish dialog */}
        <Dialog open={isPublishDialogOpen} onOpenChange={(open) => { setIsPublishDialogOpen(open); if (!open) setPublishingPostId(null); }}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle>Post to Social Media</DialogTitle>
              <DialogDescription>
                Select one or more accounts to publish this post to right now.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {accounts.length > 0 ? (
                <div className="space-y-3">
                  <div className="rounded-md border divide-y">
                    {accounts.map((account) => {
                      const platformLabel = account.accountType === 'INSTAGRAM' ? 'Instagram'
                        : account.accountType === 'LINKEDIN' ? 'LinkedIn'
                        : account.accountType === 'BLUESKY' ? 'Bluesky'
                        : 'X';
                      const isBluesky = account.accountType === 'BLUESKY';
                      const isChecked = publishDialogAccountIds.includes(account.id);
                      const isUnsupported = account.accountType === 'BLUESKY';
                      return (
                        <label
                          key={account.id}
                          className={`flex items-center gap-3 px-3 py-2 transition-colors ${isBluesky ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted/50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isBluesky}
                            onChange={(e) => {
                              if (isBluesky) return;
                              setPublishDialogAccountIds(e.target.checked
                                ? [...publishDialogAccountIds, account.id]
                                : publishDialogAccountIds.filter(id => id !== account.id));
                            }}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <span className="text-sm font-medium">{account.username}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {platformLabel}{isBluesky ? ' (coming soon)' : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {publishingPostId && (() => {
                    const post = posts.find(p => p.id === publishingPostId);
                    if (!post) return null;
                    return (
                      <div className="rounded-md bg-muted p-3">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Post preview</div>
                        {post.imageUrl && (
                          <div className="aspect-square relative rounded-md overflow-hidden border max-w-[120px] mb-2">
                            <img src={post.imageUrl} alt="Post preview" className="object-cover w-full h-full" />
                          </div>
                        )}
                        <p className="text-sm line-clamp-3">{post.caption}</p>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-muted-foreground">You need to add a social media account first.</p>
                  <Button variant="outline" className="mt-2" onClick={() => { setIsPublishDialogOpen(false); setIsAddingAccount(true); }}>
                    Add Social Media Account
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPublishDialogOpen(false)}>Cancel</Button>
              <Button
                disabled={publishDialogAccountIds.length === 0 || isPublishing}
                onClick={async () => {
                  if (!publishingPostId || publishDialogAccountIds.length === 0) return;
                  setIsPublishing(true);
                  try {
                    const response = await fetch(`/api/content-posts/${publishingPostId}/publish-all`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ accountIds: publishDialogAccountIds }),
                      credentials: 'include',
                    });
                    const result = await response.json();
                    if (response.ok || response.status === 207) {
                      setPosts(posts.map(p => p.id === publishingPostId ? { ...p, status: 'PUBLISHED' as const } : p));
                      toast({ title: result.success ? "Published" : "Partial publish", description: result.message });
                      setIsPublishDialogOpen(false);
                    } else {
                      throw new Error(result.error || 'Publish failed');
                    }
                  } catch (error) {
                    toast({ variant: "destructive", title: "Publish failed", description: error instanceof Error ? error.message : "Failed to publish" });
                    setPosts(posts.map(p => p.id === publishingPostId ? { ...p, status: 'FAILED' as const } : p));
                  } finally {
                    setIsPublishing(false);
                  }
                }}
              >
                {isPublishing ? <><RefreshCw className="h-4 w-4 animate-spin mr-1" />Publishing...</> : `Publish to ${publishDialogAccountIds.length} account(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                      <option key={account.id} value={account.id} disabled={account.accountType === "BLUESKY"}>
                        {account.username} ({account.accountType === "INSTAGRAM" ? "Instagram" :
                         account.accountType === "LINKEDIN" ? "LinkedIn" :
                         account.accountType === "BLUESKY" ? "Bluesky — coming soon" : "X"})
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