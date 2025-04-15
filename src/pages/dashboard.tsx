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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  scheduledFor?: string;
  socialMediaAccountId?: string;
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
    scheduledFor: null as string | null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);

  // Fetch social media accounts and content posts
  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        try {
          // Fetch social media accounts
          const accountsResponse = await fetch('/api/social-media-accounts');
          if (accountsResponse.ok) {
            const accountsData = await accountsResponse.json();
            setAccounts(accountsData);
          } else {
            console.error('Failed to fetch social media accounts');
          }
          
          // Fetch content posts
          const postsResponse = await fetch('/api/content-posts');
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

    try {
      // Handle file upload if a file was selected
      let imageUrl = newPost.imageUrl;
      
      if (newPost.imageFile) {
        // Create a FormData object to upload the file
        const formData = new FormData();
        formData.append('file', newPost.imageFile);
        
        try {
          // Upload the file to a temporary storage or directly to your server
          // This is a placeholder - you would need to implement a file upload API endpoint
          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          
          if (!uploadResponse.ok) {
            throw new Error('Failed to upload image');
          }
          
          const uploadData = await uploadResponse.json();
          imageUrl = uploadData.url; // Use the URL returned from the server
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to upload image. Please try again or use an image URL instead.",
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
        // Set status to DRAFT if saveAsDraft is true
        ...(saveAsDraft ? { status: 'DRAFT' } : {}),
        // Include scheduledFor if it's set
        ...(newPost.scheduledFor ? { scheduledFor: newPost.scheduledFor } : {}),
        // Only include socialMediaAccountId if it's not empty
        ...(newPost.socialMediaAccountId && newPost.socialMediaAccountId.trim() !== '' 
          ? { socialMediaAccountId: newPost.socialMediaAccountId } 
          : {})
      };

      const response = await fetch('/api/content-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
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
      
      const newPostData = await response.json();
      setPosts([...posts, newPostData]);
      setNewPost({ 
        caption: "", 
        imageUrl: "", 
        imageFile: null,
        socialMediaAccountId: "", 
        contentType: "IMAGE",
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
                        Enter your social media credentials to connect your account.
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
                          You can get your access token from the respective platform's developer portal.
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddingAccount(false)}>Cancel</Button>
                      <Button onClick={handleAddAccount}>Add Account</Button>
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
                              fetch('/api/social-media-accounts')
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
                          
                          <div className="grid gap-2">
                            <Label htmlFor="caption">Caption</Label>
                            <Textarea
                              id="caption"
                              value={newPost.caption}
                              onChange={(e) => setNewPost({...newPost, caption: e.target.value})}
                              placeholder="Write your post caption here..."
                              className="min-h-[100px]"
                            />
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
                            <Label htmlFor="scheduledFor">Schedule Post</Label>
                            <div className="flex flex-col space-y-2">
                              <div className="grid gap-2">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className="w-full justify-start text-left font-normal"
                                    >
                                      <Calendar className="mr-2 h-4 w-4" />
                                      {newPost.scheduledFor ? 
                                        format(new Date(newPost.scheduledFor), 'PPP') : 
                                        "Pick a date"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0">
                                    <Calendar
                                      mode="single"
                                      selected={newPost.scheduledFor ? new Date(newPost.scheduledFor) : undefined}
                                      onSelect={(date) => {
                                        if (date) {
                                          // Preserve the time if already set
                                          const currentDate = newPost.scheduledFor ? new Date(newPost.scheduledFor) : new Date();
                                          date.setHours(currentDate.getHours());
                                          date.setMinutes(currentDate.getMinutes());
                                          setNewPost({...newPost, scheduledFor: date.toISOString()});
                                        }
                                      }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="flex space-x-2">
                                <select
                                  className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  value={newPost.scheduledFor ? new Date(newPost.scheduledFor).getHours() : new Date().getHours()}
                                  onChange={(e) => {
                                    const hours = parseInt(e.target.value);
                                    const date = newPost.scheduledFor ? new Date(newPost.scheduledFor) : new Date();
                                    date.setHours(hours);
                                    setNewPost({...newPost, scheduledFor: date.toISOString()});
                                  }}
                                >
                                  {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>
                                      {i.toString().padStart(2, '0')}
                                    </option>
                                  ))}
                                </select>
                                <span className="flex items-center">:</span>
                                <select
                                  className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  value={newPost.scheduledFor ? new Date(newPost.scheduledFor).getMinutes() : new Date().getMinutes()}
                                  onChange={(e) => {
                                    const minutes = parseInt(e.target.value);
                                    const date = newPost.scheduledFor ? new Date(newPost.scheduledFor) : new Date();
                                    date.setMinutes(minutes);
                                    setNewPost({...newPost, scheduledFor: date.toISOString()});
                                  }}
                                >
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
                                value={newPost.instagramAccountId}
                                onChange={(e) => setNewPost({...newPost, instagramAccountId: e.target.value})}
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
                      <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setIsCreatingPost(false)}>Cancel</Button>
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
                                        });
                                        
                                        if (!response.ok) {
                                          const errorData = await response.json();
                                          throw new Error(errorData.error || errorData.details || 'Failed to post to social media');
                                        }
                                        
                                        const result = await response.json();
                                        
                                        // Update the post in the local state
                                        setPosts(posts.map(p => 
                                          p.id === post.id 
                                            ? {...p, status: 'PUBLISHED', socialMediaAccountId: accountId} 
                                            : p
                                        ));
                                        
                                        toast({
                                          title: "Success",
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
                                          title: "Error",
                                          description: error instanceof Error ? error.message : "Failed to post to social media",
                                        });
                                        
                                        // Update the post status to FAILED in the local state
                                        setPosts(posts.map(p => 
                                          p.id === post.id 
                                            ? {...p, status: 'FAILED'} 
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
                                // Open a dialog to schedule the post
                                // This would be implemented in a real app
                                toast({
                                  title: "Feature coming soon",
                                  description: "Schedule post functionality is under development",
                                });
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
                                          });
                                          
                                          if (!response.ok) {
                                            const errorData = await response.json();
                                            throw new Error(errorData.error || errorData.details || 'Failed to post to social media');
                                          }
                                          
                                          const result = await response.json();
                                          
                                          // Update the post in the local state
                                          setPosts(posts.map(p => 
                                            p.id === post.id 
                                              ? {...p, status: 'PUBLISHED', socialMediaAccountId: accountId} 
                                              : p
                                          ));
                                          
                                          toast({
                                            title: "Success",
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
                                            title: "Error",
                                            description: error instanceof Error ? error.message : "Failed to post to social media",
                                          });
                                          
                                          // Update the post status to FAILED in the local state
                                          setPosts(posts.map(p => 
                                            p.id === post.id 
                                              ? {...p, status: 'FAILED'} 
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
                                  // Open scheduling dialog
                                  setNewPost({
                                    caption: post.caption,
                                    imageUrl: post.imageUrl || "",
                                    imageFile: null,
                                    socialMediaAccountId: post.socialMediaAccountId || "",
                                    contentType: post.contentType,
                                    scheduledFor: new Date().toISOString() // Set default to current time
                                  });
                                  setIsCreatingPost(true);
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
              </Tabs>
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
      </div>
    </ProtectedRoute>
  );
}