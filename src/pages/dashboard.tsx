import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Instagram, Plus, Calendar, Image, Trash2, Edit, RefreshCw } from "lucide-react";
import { useRouter } from "next/router";
import ProtectedRoute from "@/components/ProtectedRoute";

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
      const response = await fetch('/api/content-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPost),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create post');
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
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create post",
      });
    }
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
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4 mr-2" /> Edit
                        </Button>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" /> Remove
                        </Button>
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
                <Dialog open={isCreatingPost} onOpenChange={setIsCreatingPost}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" /> Create New Post
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[525px]">
                    <DialogHeader>
                      <DialogTitle>Create Instagram Post</DialogTitle>
                      <DialogDescription>
                        Craft your post content and optionally use AI to enhance it.
                      </DialogDescription>
                    </DialogHeader>
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
                        <Button variant="outline" className="mt-2">
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
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreatingPost(false)}>Cancel</Button>
                      <Button onClick={handleCreatePost}>Create Post</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
                            <div className="absolute inset-0 flex items-center justify-center bg-muted">
                              <Image className="h-8 w-8 text-muted-foreground" />
                            </div>
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground line-clamp-3">{post.caption}</p>
                      </CardContent>
                      <CardFooter className="flex justify-between">
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4 mr-2" /> Edit
                        </Button>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </Button>
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