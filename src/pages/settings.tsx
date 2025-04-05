import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, KeyRound, Settings, ArrowLeft } from "lucide-react";
import { useRouter } from "next/router";
import ProtectedRoute from "@/components/ProtectedRoute";

type UserSettings = {
  id: string;
  openaiApiKey: string | null;
  geminiApiKey: string | null;
  openaiMonthlyLimit: number;
  geminiMonthlyLimit: number;
  openaiUsageCount: number;
  geminiUsageCount: number;
  usageResetDate: string;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiMonthlyLimit, setOpenaiMonthlyLimit] = useState(100);
  const [geminiMonthlyLimit, setGeminiMonthlyLimit] = useState(100);
  
  // Fetch user settings
  useEffect(() => {
    if (user) {
      const fetchSettings = async () => {
        try {
          const response = await fetch('/api/user/settings');
          
          if (response.ok) {
            const data = await response.json();
            setSettings(data);
            
            // Initialize form state with existing settings
            setOpenaiApiKey(data.openaiApiKey || "");
            setGeminiApiKey(data.geminiApiKey || "");
            setOpenaiMonthlyLimit(data.openaiMonthlyLimit);
            setGeminiMonthlyLimit(data.geminiMonthlyLimit);
          } else {
            // If settings don't exist yet, that's okay
            console.log('No settings found, will create on save');
          }
        } catch (error) {
          console.error('Error fetching settings:', error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to load your settings. Please try again.",
          });
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchSettings();
    }
  }, [user, toast]);
  
  const handleSaveSettings = async () => {
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openaiApiKey,
          geminiApiKey,
          openaiMonthlyLimit,
          geminiMonthlyLimit,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }
      
      const updatedSettings = await response.json();
      setSettings(updatedSettings);
      
      toast({
        title: "Success",
        description: "Your settings have been saved successfully",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-background flex-col">
        <header className="border-b">
          <div className="container flex h-16 items-center justify-between py-4">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/dashboard')}
                className="mr-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold">Settings</h1>
            </div>
          </div>
        </header>
        
        <main className="flex-1 container py-6">
          <Tabs defaultValue="api-keys">
            <TabsList className="mb-6">
              <TabsTrigger value="api-keys">API Keys</TabsTrigger>
              <TabsTrigger value="usage-limits">Usage Limits</TabsTrigger>
            </TabsList>
            
            <TabsContent value="api-keys">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <KeyRound className="h-5 w-5 mr-2" />
                    API Keys
                  </CardTitle>
                  <CardDescription>
                    Configure your API keys for AI services. These keys will be used instead of the default ones.
                  </CardDescription>
                </CardHeader>
                
                <CardContent>
                  {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label htmlFor="openai-api-key">OpenAI API Key</Label>
                        <Input
                          id="openai-api-key"
                          type="password"
                          placeholder="sk-..."
                          value={openaiApiKey}
                          onChange={(e) => setOpenaiApiKey(e.target.value)}
                        />
                        <p className="text-sm text-muted-foreground">
                          Get your API key from the <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">OpenAI dashboard</a>.
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="gemini-api-key">Google Gemini API Key</Label>
                        <Input
                          id="gemini-api-key"
                          type="password"
                          placeholder="AIza..."
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                        />
                        <p className="text-sm text-muted-foreground">
                          Get your API key from the <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline">Google AI Studio</a>.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="usage-limits">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Settings className="h-5 w-5 mr-2" />
                    Usage Limits
                  </CardTitle>
                  <CardDescription>
                    Set monthly limits for AI service usage to control your costs.
                  </CardDescription>
                </CardHeader>
                
                <CardContent>
                  {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label htmlFor="openai-limit">OpenAI Monthly Limit</Label>
                          <span className="text-sm font-medium">{openaiMonthlyLimit} requests</span>
                        </div>
                        <Slider
                          id="openai-limit"
                          min={10}
                          max={1000}
                          step={10}
                          value={[openaiMonthlyLimit]}
                          onValueChange={(value) => setOpenaiMonthlyLimit(value[0])}
                        />
                        {settings && (
                          <div className="text-sm text-muted-foreground">
                            Current usage: {settings.openaiUsageCount} / {settings.openaiMonthlyLimit} requests
                            {settings.usageResetDate && (
                              <span> (Resets on {new Date(settings.usageResetDate).toLocaleDateString()})</span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label htmlFor="gemini-limit">Gemini Monthly Limit</Label>
                          <span className="text-sm font-medium">{geminiMonthlyLimit} requests</span>
                        </div>
                        <Slider
                          id="gemini-limit"
                          min={10}
                          max={1000}
                          step={10}
                          value={[geminiMonthlyLimit]}
                          onValueChange={(value) => setGeminiMonthlyLimit(value[0])}
                        />
                        {settings && (
                          <div className="text-sm text-muted-foreground">
                            Current usage: {settings.geminiUsageCount} / {settings.geminiMonthlyLimit} requests
                            {settings.usageResetDate && (
                              <span> (Resets on {new Date(settings.usageResetDate).toLocaleDateString()})</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          <div className="mt-6 flex justify-end">
            <Button onClick={handleSaveSettings} disabled={isLoading || isSaving}>
              {isSaving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Settings"
              )}
            </Button>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}