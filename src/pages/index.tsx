import React from "react";
import Head from "next/head";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import Link from "next/link";
import { Instagram } from "lucide-react";

export default function Home() {
  return (
    <>
      <Head>
        <title>InstaCreate - AI-Powered Instagram Content Generator</title>
        <meta name="description" content="Generate and schedule Instagram content with AI assistance" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="bg-background min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
          <div className="max-w-4xl w-full text-center mb-12">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-transparent bg-clip-text">
              Create Instagram Content with AI
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Generate, optimize, and schedule Instagram posts with our AI-powered platform
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup" passHref>
                <Button size="lg" className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600">
                  Get Started
                </Button>
              </Link>
              <Link href="/login" passHref>
                <Button size="lg" variant="outline">
                  Log In
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
            <Card>
              <CardHeader>
                <Instagram className="h-10 w-10 text-pink-500 mb-2" />
                <CardTitle>Connect Instagram</CardTitle>
                <CardDescription>Securely link your Instagram account to schedule and post content</CardDescription>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-purple-500 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
                <CardTitle>AI Content Generation</CardTitle>
                <CardDescription>Create engaging captions and image ideas with AI assistance</CardDescription>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-500 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <CardTitle>Schedule Posts</CardTitle>
                <CardDescription>Plan and schedule your content for optimal engagement times</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}