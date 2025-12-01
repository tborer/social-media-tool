import React, { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar as CalendarIcon, Clock, Image, Video, FileText, Edit, Trash2, Eye } from 'lucide-react';
import { format, isSameDay, startOfDay, endOfDay } from 'date-fns';

interface Post {
  id: string;
  caption: string;
  imageUrl: string | null;
  contentType: 'IMAGE' | 'VIDEO' | 'BLOG_POST';
  videoType?: 'FEED' | 'REELS' | null;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';
  scheduledFor: string | null;
  createdAt: string;
  socialMediaAccount?: {
    username: string;
    accountType: string;
  } | null;
}

interface CalendarViewProps {
  posts: Post[];
  onEditPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onViewPost?: (postId: string) => void;
  onReschedulePost?: (postId: string, newDate: Date) => void;
}

export function CalendarView({
  posts,
  onEditPost,
  onDeletePost,
  onViewPost,
  onReschedulePost
}: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedDayPosts, setSelectedDayPosts] = useState<Post[]>([]);
  const [showDayDialog, setShowDayDialog] = useState(false);

  // Group posts by date
  const postsByDate = useMemo(() => {
    const grouped = new Map<string, Post[]>();

    posts.forEach(post => {
      const date = post.scheduledFor
        ? format(new Date(post.scheduledFor), 'yyyy-MM-dd')
        : format(new Date(post.createdAt), 'yyyy-MM-dd');

      if (!grouped.has(date)) {
        grouped.set(date, []);
      }
      grouped.get(date)!.push(post);
    });

    return grouped;
  }, [posts]);

  // Get dates that have posts for calendar highlighting
  const datesWithPosts = useMemo(() => {
    return Array.from(postsByDate.keys()).map(dateStr => new Date(dateStr));
  }, [postsByDate]);

  // Handle date selection
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    setSelectedDate(date);
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayPosts = postsByDate.get(dateStr) || [];
    setSelectedDayPosts(dayPosts);

    if (dayPosts.length > 0) {
      setShowDayDialog(true);
    }
  };

  // Get status color
  const getStatusColor = (status: Post['status']) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'SCHEDULED':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'PUBLISHED':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'FAILED':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Get content type icon
  const getContentIcon = (contentType: Post['contentType'], videoType?: string | null) => {
    switch (contentType) {
      case 'IMAGE':
        return <Image className="h-4 w-4" />;
      case 'VIDEO':
        return videoType === 'REELS'
          ? <Video className="h-4 w-4 text-purple-600" />
          : <Video className="h-4 w-4" />;
      case 'BLOG_POST':
        return <FileText className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  // Custom day renderer to show post indicators
  const modifiers = {
    hasPosts: datesWithPosts,
  };

  const modifiersClassNames = {
    hasPosts: 'relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-blue-600 after:rounded-full',
  };

  return (
    <div className="space-y-6">
      {/* Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Content Calendar
          </CardTitle>
          <CardDescription>
            View and manage your posts organized by date. Click on a date to see all posts scheduled for that day.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            className="rounded-md border"
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
          />
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Status Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge className={getStatusColor('DRAFT')}>Draft</Badge>
            <Badge className={getStatusColor('SCHEDULED')}>Scheduled</Badge>
            <Badge className={getStatusColor('PUBLISHED')}>Published</Badge>
            <Badge className={getStatusColor('FAILED')}>Failed</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Posts Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Upcoming Scheduled Posts</CardTitle>
          <CardDescription>Posts scheduled for the next 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {posts
                .filter(post => {
                  if (!post.scheduledFor) return false;
                  const scheduledDate = new Date(post.scheduledFor);
                  const now = new Date();
                  const sevenDaysFromNow = new Date();
                  sevenDaysFromNow.setDate(now.getDate() + 7);
                  return scheduledDate >= now && scheduledDate <= sevenDaysFromNow && post.status === 'SCHEDULED';
                })
                .sort((a, b) => {
                  const dateA = new Date(a.scheduledFor!).getTime();
                  const dateB = new Date(b.scheduledFor!).getTime();
                  return dateA - dateB;
                })
                .map(post => (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => {
                      if (post.scheduledFor) {
                        handleDateSelect(new Date(post.scheduledFor));
                      }
                    }}
                  >
                    <div className="flex-shrink-0 mt-1">
                      {getContentIcon(post.contentType, post.videoType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`${getStatusColor(post.status)} text-xs`}>
                          {post.status}
                        </Badge>
                        {post.videoType && (
                          <Badge variant="outline" className="text-xs">
                            {post.videoType}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{post.caption.substring(0, 50)}...</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3" />
                        {post.scheduledFor && format(new Date(post.scheduledFor), 'MMM d, yyyy h:mm a')}
                      </div>
                      {post.socialMediaAccount && (
                        <p className="text-xs text-muted-foreground mt-1">
                          @{post.socialMediaAccount.username} ({post.socialMediaAccount.accountType})
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              {posts.filter(post => {
                if (!post.scheduledFor) return false;
                const scheduledDate = new Date(post.scheduledFor);
                const now = new Date();
                const sevenDaysFromNow = new Date();
                sevenDaysFromNow.setDate(now.getDate() + 7);
                return scheduledDate >= now && scheduledDate <= sevenDaysFromNow && post.status === 'SCHEDULED';
              }).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No upcoming scheduled posts
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Day Details Dialog */}
      <Dialog open={showDayDialog} onOpenChange={setShowDayDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Posts for {selectedDate && format(selectedDate, 'MMMM d, yyyy')}
            </DialogTitle>
            <DialogDescription>
              {selectedDayPosts.length} post{selectedDayPosts.length !== 1 ? 's' : ''} on this date
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {selectedDayPosts.map(post => (
              <Card key={post.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getContentIcon(post.contentType, post.videoType)}
                        <Badge className={getStatusColor(post.status)}>
                          {post.status}
                        </Badge>
                        {post.videoType && (
                          <Badge variant="outline">
                            {post.videoType}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-base">{post.caption.substring(0, 60)}...</CardTitle>
                      {post.scheduledFor && (
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(post.scheduledFor), 'h:mm a')}
                        </CardDescription>
                      )}
                    </div>
                    {post.imageUrl && (
                      <div className="w-20 h-20 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {post.contentType === 'VIDEO' ? (
                          <video
                            src={post.imageUrl}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={post.imageUrl}
                            alt="Post preview"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {post.caption}
                  </p>
                  {post.socialMediaAccount && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Account: @{post.socialMediaAccount.username} ({post.socialMediaAccount.accountType})
                    </p>
                  )}
                </CardContent>
                <CardFooter className="flex gap-2">
                  {onViewPost && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewPost(post.id)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  )}
                  {onEditPost && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEditPost(post.id)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  {onDeletePost && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onDeletePost(post.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
