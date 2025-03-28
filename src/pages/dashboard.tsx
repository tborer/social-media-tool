import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { Instagram, Plus, Calendar, Image, Trash2, Edit, RefreshCw } from "lucide-react";
import { useRouter } from "next/router";
import ProtectedRoute from "@/components/ProtectedRoute";
import AIContentGenerator from "@/components/AIContentGenerator";

type InstagramAccount = {
  id: string;
  username: string;
  accessToken: string;
};

type ContentPost = {
  id: string;
  caption: string;
  imageUrl?: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  scheduledFor?: string;
  instagramAccountId?: string;
};

// Component for editing Instagram account details
function EditAccountForm({ account, onSuccess }: { account: InstagramAccount; onSuccess: () => void }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    username: account.username,
    accessToken: account.accessToken,
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
      const response = await fetch(`/api/instagram-accounts/${account.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update Instagram account');
      }
      
      toast({
        title: "Success",
        description: "Instagram account updated successfully",
      });
      
      onSuccess();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update Instagram account",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="edit-username">Instagram Username</Label>
          <Input
            id="edit-username"
            value={formData.username}
            onChange={(e) => setFormData({...formData, username: e.target.value})}
            placeholder="your_instagram_handle"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="edit-token">Access Token</Label>
          <Input
            id="edit-token"
            type="password"
            value={formData.accessToken}
            onChange={(e) => setFormData({...formData, accessToken: e.target.value})}
            placeholder="Your Instagram API access token"
          />
          <p className="text-sm text-muted-foreground">
            You can get your access token from the Instagram Developer Portal.
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
  
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ username: "", accessToken: "" });
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [newPost, setNewPost] = useState({ caption: "", imageUrl: "", instagramAccountId: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);

  // Fetch Instagram accounts and content posts
  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        try {
          // Fetch Instagram accounts
          const accountsResponse = await fetch('/api/instagram-accounts');
          if (accountsResponse.ok) {
            const accountsData = await accountsResponse.json();
            setAccounts(accountsData);
          } else {
            console.error('Failed to fetch Instagram accounts');
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
    if (!newAccount.username || !newAccount.accessToken) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }

    try {
      const response = await fetch('/api/instagram-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAccount),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add Instagram account');
      }
      
      const newAccountData = await response.json();
      setAccounts([...accounts, newAccountData]);
      setNewAccount({ username: "", accessToken: "" });
      setIsAddingAccount(false);
      
      toast({
        title: "Success",
        description: "Instagram account added successfully",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add Instagram account",
      });
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.caption) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please add a caption for your post",
      });
      return;
    }

    try {
      // Check if the image URL is too long
      if (newPost.imageUrl && newPost.imageUrl.length > 2000) {
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
        imageUrl: newPost.imageUrl,
        // Only include instagramAccountId if it's not empty
        ...(newPost.instagramAccountId && newPost.instagramAccountId.trim() !== '' 
          ? { instagramAccountId: newPost.instagramAccountId } 
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
      setNewPost({ caption: "", imageUrl: "", instagramAccountId: "" });
      setIsCreatingPost(false);
      
      toast({
        title: "Success",
        description: "Post created successfully",
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
  
  const handleGeneratedContent = (content: { caption: string; imageUrls: string[] }) => {
    setNewPost({
      ...newPost,
      caption: content.caption,
      imageUrl: content.imageUrls[0] || "",
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
            <Button
              onClick={() => {
                signOut();
              }}
              variant="ghost"
            >
              Log Out
            </Button>
          </div>
        </header>
        
        <main className="flex-1 container py-6">
          <Tabs defaultValue="accounts">
            <TabsList className="mb-6">
              <TabsTrigger value="accounts">Instagram Accounts</TabsTrigger>
              <TabsTrigger value="content">Content Creation</TabsTrigger>
            </TabsList>
            
            <TabsContent value="accounts">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Your Instagram Accounts</h2>
                <Dialog open={isAddingAccount} onOpenChange={setIsAddingAccount}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" /> Add Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Instagram Account</DialogTitle>
                      <DialogDescription>
                        Enter your Instagram credentials to connect your account.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="username">Instagram Username</Label>
                        <Input
                          id="username"
                          value={newAccount.username}
                          onChange={(e) => setNewAccount({...newAccount, username: e.target.value})}
                          placeholder="your_instagram_handle"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="token">Access Token</Label>
                        <Input
                          id="token"
                          type="password"
                          value={newAccount.accessToken}
                          onChange={(e) => setNewAccount({...newAccount, accessToken: e.target.value})}
                          placeholder="Your Instagram API access token"
                        />
                        <p className="text-sm text-muted-foreground">
                          You can get your access token from the Instagram Developer Portal.
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
                          <Instagram className="h-5 w-5 mr-2 text-pink-500" />
                          {account.username}
                        </CardTitle>
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
                              <DialogTitle>Edit Instagram Account</DialogTitle>
                              <DialogDescription>
                                Update your Instagram account details.
                              </DialogDescription>
                            </DialogHeader>
                            <EditAccountForm account={account} onSuccess={() => {
                              // Refresh accounts after successful update
                              fetch('/api/instagram-accounts')
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
                                This will permanently delete the Instagram account "{account.username}" from your dashboard.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  try {
                                    const response = await fetch(`/api/instagram-accounts/${account.id}`, {
                                      method: 'DELETE',
                                    });
                                    
                                    if (!response.ok) {
                                      throw new Error('Failed to delete account');
                                    }
                                    
                                    // Remove the account from the state
                                    setAccounts(accounts.filter(a => a.id !== account.id));
                                    
                                    toast({
                                      title: "Success",
                                      description: `Instagram account "${account.username}" has been removed`,
                                    });
                                  } catch (error) {
                                    toast({
                                      variant: "destructive",
                                      title: "Error",
                                      description: error instanceof Error ? error.message : "Failed to remove Instagram account",
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
                    <CardTitle>No Instagram Accounts</CardTitle>
                    <CardDescription>
                      Add your first Instagram account to start creating content.
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
                            <Label htmlFor="imageUrl">Image URL</Label>
                            <Input
                              id="imageUrl"
                              value={newPost.imageUrl}
                              onChange={(e) => setNewPost({...newPost, imageUrl: e.target.value})}
                              placeholder="https://example.com/your-image.jpg"
                            />
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
                        <Button onClick={handleCreatePost}>Create Post</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              
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
                          <span className={`ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            post.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-800' :
                            post.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                            post.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {post.status}
                          </span>
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
                            <Button 
                              className="flex-1" 
                              size="sm"
                              onClick={() => {
                                // Open a dialog to confirm posting now
                                // This would be implemented in a real app
                                toast({
                                  title: "Feature coming soon",
                                  description: "Post now functionality is under development",
                                });
                              }}
                            >
                              Post Now
                            </Button>
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
          </Tabs>
        </main>
      </div>
    </ProtectedRoute>
  );
}