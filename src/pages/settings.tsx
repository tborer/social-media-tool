import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, KeyRound, Settings, ArrowLeft, Mic, X } from "lucide-react";
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
  brandVoiceTone: string | null;
  brandVoiceAudience: string | null;
  brandVoicePersonality: string | null;
  brandVoiceKeyPhrases: string[];
  brandVoiceAvoidPhrases: string[];
  brandVoiceExamples: string | null;
};

const TONE_OPTIONS = [
  { value: "casual", label: "Casual — friendly, conversational, approachable" },
  { value: "professional", label: "Professional — formal, authoritative, polished" },
  { value: "storytelling", label: "Storytelling — narrative-driven, emotional, engaging" },
  { value: "humorous", label: "Humorous — witty, playful, lighthearted" },
  { value: "inspirational", label: "Inspirational — motivating, uplifting, empowering" },
  { value: "direct", label: "Direct — concise, clear, action-oriented" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // API Keys & Limits form state
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiMonthlyLimit, setOpenaiMonthlyLimit] = useState(100);
  const [geminiMonthlyLimit, setGeminiMonthlyLimit] = useState(100);

  // Brand Voice form state
  const [brandVoiceTone, setBrandVoiceTone] = useState<string>("");
  const [brandVoiceAudience, setBrandVoiceAudience] = useState("");
  const [brandVoicePersonality, setBrandVoicePersonality] = useState("");
  const [brandVoiceKeyPhrases, setBrandVoiceKeyPhrases] = useState<string[]>([]);
  const [brandVoiceAvoidPhrases, setBrandVoiceAvoidPhrases] = useState<string[]>([]);
  const [brandVoiceExamples, setBrandVoiceExamples] = useState("");
  const [keyPhraseInput, setKeyPhraseInput] = useState("");
  const [avoidPhraseInput, setAvoidPhraseInput] = useState("");

  // Fetch user settings
  useEffect(() => {
    if (user) {
      const fetchSettings = async () => {
        try {
          const response = await fetch('/api/user/settings');

          if (response.ok) {
            const data: UserSettings = await response.json();
            setSettings(data);

            // Initialize form state with existing settings
            setOpenaiApiKey(data.openaiApiKey || "");
            setGeminiApiKey(data.geminiApiKey || "");
            setOpenaiMonthlyLimit(data.openaiMonthlyLimit);
            setGeminiMonthlyLimit(data.geminiMonthlyLimit);

            // Brand voice
            setBrandVoiceTone(data.brandVoiceTone || "");
            setBrandVoiceAudience(data.brandVoiceAudience || "");
            setBrandVoicePersonality(data.brandVoicePersonality || "");
            setBrandVoiceKeyPhrases(data.brandVoiceKeyPhrases || []);
            setBrandVoiceAvoidPhrases(data.brandVoiceAvoidPhrases || []);
            setBrandVoiceExamples(data.brandVoiceExamples || "");
          } else {
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
          brandVoiceTone: brandVoiceTone || null,
          brandVoiceAudience,
          brandVoicePersonality,
          brandVoiceKeyPhrases,
          brandVoiceAvoidPhrases,
          brandVoiceExamples,
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

  const addKeyPhrase = () => {
    const trimmed = keyPhraseInput.trim();
    if (trimmed && !brandVoiceKeyPhrases.includes(trimmed)) {
      setBrandVoiceKeyPhrases([...brandVoiceKeyPhrases, trimmed]);
    }
    setKeyPhraseInput("");
  };

  const addAvoidPhrase = () => {
    const trimmed = avoidPhraseInput.trim();
    if (trimmed && !brandVoiceAvoidPhrases.includes(trimmed)) {
      setBrandVoiceAvoidPhrases([...brandVoiceAvoidPhrases, trimmed]);
    }
    setAvoidPhraseInput("");
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
              <TabsTrigger value="brand-voice">Brand Voice</TabsTrigger>
            </TabsList>

            {/* API Keys Tab */}
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

            {/* Usage Limits Tab */}
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

            {/* Brand Voice Tab */}
            <TabsContent value="brand-voice">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Mic className="h-5 w-5 mr-2" />
                    Brand Voice
                  </CardTitle>
                  <CardDescription>
                    Define your brand voice so every AI-generated caption automatically matches your style. Once saved, all caption generation will conform to these guidelines.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Tone */}
                      <div className="space-y-2">
                        <Label htmlFor="brand-voice-tone">Tone</Label>
                        <Select value={brandVoiceTone} onValueChange={setBrandVoiceTone}>
                          <SelectTrigger id="brand-voice-tone">
                            <SelectValue placeholder="Select a tone..." />
                          </SelectTrigger>
                          <SelectContent>
                            {TONE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {brandVoiceTone && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground h-auto p-0 text-xs"
                            onClick={() => setBrandVoiceTone("")}
                          >
                            Clear tone
                          </Button>
                        )}
                      </div>

                      {/* Target Audience */}
                      <div className="space-y-2">
                        <Label htmlFor="brand-voice-audience">Target Audience</Label>
                        <Input
                          id="brand-voice-audience"
                          placeholder="e.g. millennials interested in fitness and wellness"
                          value={brandVoiceAudience}
                          onChange={(e) => setBrandVoiceAudience(e.target.value)}
                        />
                      </div>

                      {/* Brand Personality */}
                      <div className="space-y-2">
                        <Label htmlFor="brand-voice-personality">Brand Personality</Label>
                        <Input
                          id="brand-voice-personality"
                          placeholder="e.g. friendly, energetic, authentic, bold"
                          value={brandVoicePersonality}
                          onChange={(e) => setBrandVoicePersonality(e.target.value)}
                        />
                      </div>

                      {/* Key Phrases */}
                      <div className="space-y-2">
                        <Label>Key Phrases to Include</Label>
                        <p className="text-xs text-muted-foreground">Words, phrases, or themes the AI should always incorporate.</p>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add a phrase..."
                            value={keyPhraseInput}
                            onChange={(e) => setKeyPhraseInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyPhrase(); } }}
                          />
                          <Button type="button" variant="outline" onClick={addKeyPhrase}>Add</Button>
                        </div>
                        {brandVoiceKeyPhrases.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {brandVoiceKeyPhrases.map((phrase) => (
                              <Badge key={phrase} variant="secondary" className="flex items-center gap-1">
                                {phrase}
                                <button
                                  type="button"
                                  onClick={() => setBrandVoiceKeyPhrases(brandVoiceKeyPhrases.filter(p => p !== phrase))}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Avoid Phrases */}
                      <div className="space-y-2">
                        <Label>Phrases to Avoid</Label>
                        <p className="text-xs text-muted-foreground">Words or phrases the AI should never use.</p>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add a phrase..."
                            value={avoidPhraseInput}
                            onChange={(e) => setAvoidPhraseInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAvoidPhrase(); } }}
                          />
                          <Button type="button" variant="outline" onClick={addAvoidPhrase}>Add</Button>
                        </div>
                        {brandVoiceAvoidPhrases.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {brandVoiceAvoidPhrases.map((phrase) => (
                              <Badge key={phrase} variant="destructive" className="flex items-center gap-1">
                                {phrase}
                                <button
                                  type="button"
                                  onClick={() => setBrandVoiceAvoidPhrases(brandVoiceAvoidPhrases.filter(p => p !== phrase))}
                                  className="ml-1 hover:opacity-70"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Example Captions */}
                      <div className="space-y-2">
                        <Label htmlFor="brand-voice-examples">Example Captions</Label>
                        <p className="text-xs text-muted-foreground">Paste 1–3 example captions that exemplify your brand voice. The AI will use these as style references.</p>
                        <Textarea
                          id="brand-voice-examples"
                          placeholder={"Example 1: Your caption here...\n\nExample 2: Another caption..."}
                          value={brandVoiceExamples}
                          onChange={(e) => setBrandVoiceExamples(e.target.value)}
                          className="min-h-[120px]"
                        />
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
