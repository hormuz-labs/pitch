import { Layout, Typography, Button, Space, Tag, Spin, Card, List, Empty } from 'antd';
import { 
  DownloadOutlined, 
  LeftOutlined,
  PlayCircleOutlined,
  CheckCircleFilled,
  LoadingOutlined,
  AudioOutlined,
  VideoCameraOutlined
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import type { Project, LogEntry } from '../types';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

interface EditorViewProps {
  projects: Project[];
  jobLogs: Record<string, LogEntry[]>;
  isMobile: boolean;
}

export const EditorView = ({ projects, jobLogs, isMobile }: EditorViewProps) => {
  const navigate = useNavigate();
  const { id } = useParams();
  
  const selectedProject = projects.find(p => p.id === id);
  const logs = jobLogs[id || ''] || [];
  const latestScreenshot = [...logs].reverse().find(l => l.screenshot)?.screenshot;
  
  // Filter for meaningful logs (text and calls)
  const displayLogs = logs.filter(l => l.type === 'text' || l.type === 'call').slice(-5);

  if (!selectedProject) {
    return (
      <div style={{ padding: 48, textAlign: 'center', flex: 1, color: '#fff' }}>
        <Title level={4}>Project not found or loading...</Title>
        <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
      </div>
    );
  }

  const isProcessing = selectedProject.status === 'PROCESSING' || selectedProject.status === 'PENDING';
  const isCompleted = selectedProject.status === 'COMPLETED';
  const isFailed = selectedProject.status === 'FAILED';

  return (
    <Content style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', background: '#0a0a0a' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #1f1f1f', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#141414', zIndex: 10 }}>
        <Space>
          <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')} type="text">Dashboard</Button>
          <Divider type="vertical" style={{ borderColor: '#333' }} />
          <Title level={5} style={{ margin: 0 }}>{selectedProject?.parameters?.url || 'Video Generation'}</Title>
        </Space>
        {isCompleted && (
          <Space>
            <Button 
              icon={<DownloadOutlined />} 
              type="primary" 
              onClick={() => window.open(selectedProject.videoUrl)}
            >
              Download Video
            </Button>
          </Space>
        )}
      </div>

      <div style={{ flex: 1, padding: isMobile ? '16px' : '40px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {isProcessing && (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <Card style={{ background: '#141414', borderColor: '#303030', borderRadius: 12 }}>
              <div style={{ marginBottom: 32 }}>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                <Title level={3} style={{ marginTop: 24 }}>Generating your video...</Title>
                <Paragraph type="secondary">
                  We're currently processing your request. This typically takes 1-2 minutes.
                </Paragraph>
              </div>

              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, textAlign: 'left' }}>
                <div style={{ flex: 1 }}>
                  <Title level={5} style={{ color: '#888', textTransform: 'uppercase', fontSize: 12, letterSpacing: 1 }}>Current Status</Title>
                  <List
                    size="small"
                    dataSource={displayLogs.length > 0 ? displayLogs : [{ message: 'Initializing agent...', timestamp: '' } as LogEntry]}
                    renderItem={(item) => (
                      <List.Item style={{ border: 'none', padding: '4px 0' }}>
                        <Text style={{ fontSize: 13, color: '#ccc' }}>
                          <span style={{ color: '#555', marginRight: 8 }}>{item.timestamp}</span>
                          {item.message}
                        </Text>
                      </List.Item>
                    )}
                  />
                </div>
                
                {latestScreenshot && (
                  <div style={{ width: isMobile ? '100%' : 300 }}>
                    <Title level={5} style={{ color: '#888', textTransform: 'uppercase', fontSize: 12, letterSpacing: 1 }}>Live Preview</Title>
                    <div style={{ border: '1px solid #333', borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                      <img src={latestScreenshot} style={{ width: '100%', display: 'block' }} alt="Live screenshot" />
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {isCompleted && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
             <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <CheckCircleFilled style={{ fontSize: 48, color: '#52c41a' }} />
                <Title level={2} style={{ marginTop: 16 }}>Video is Ready!</Title>
                <Text type="secondary">Your video has been successfully generated and is ready for download.</Text>
             </div>

             <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24 }}>
                <div style={{ flex: 2 }}>
                  <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', border: '1px solid #303030', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    <video 
                      src={selectedProject.videoUrl} 
                      controls 
                      autoPlay
                      style={{ width: '100%', display: 'block' }} 
                    />
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <Title level={5}>Download Assets</Title>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button 
                      block 
                      size="large" 
                      icon={<VideoCameraOutlined />} 
                      onClick={() => window.open(selectedProject.videoUrl)}
                      style={{ height: 60, textAlign: 'left', background: '#1f1f1f', borderColor: '#303030' }}
                    >
                      <div style={{ display: 'inline-block', marginLeft: 8 }}>
                        <div style={{ fontWeight: 600 }}>Download Video</div>
                        <div style={{ fontSize: 12, color: '#888' }}>MP4 format • High Quality</div>
                      </div>
                    </Button>
                    
                    <Button 
                      block 
                      size="large" 
                      icon={<AudioOutlined />} 
                      disabled={!selectedProject.audioUrl && !selectedProject.videoUrl}
                      onClick={() => {
                        const audioUrl = selectedProject.audioUrl || selectedProject.videoUrl?.replace('.mp4', '.wav');
                        if (audioUrl) window.open(audioUrl);
                      }}
                      style={{ height: 60, textAlign: 'left', background: '#1f1f1f', borderColor: '#303030' }}
                    >
                      <div style={{ display: 'inline-block', marginLeft: 8 }}>
                        <div style={{ fontWeight: 600 }}>Download Voiceover</div>
                        <div style={{ fontSize: 12, color: '#888' }}>WAV format • AI Narration</div>
                      </div>
                    </Button>
                  </Space>

                  <Card size="small" title="Project Details" style={{ marginTop: 24, background: '#141414', borderColor: '#303030' }}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 8 }}><Text type="secondary">Target URL:</Text> <div>{selectedProject.parameters.url}</div></div>
                      <div><Text type="secondary">Generated:</Text> <div>{new Date(selectedProject.updatedAt).toLocaleString()}</div></div>
                    </div>
                  </Card>
                </div>
             </div>
          </div>
        )}

        {isFailed && (
          <div style={{ textAlign: 'center', marginTop: 80 }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical">
                  <Text strong style={{ fontSize: 18 }}>Generation Failed</Text>
                  <Text type="secondary">Something went wrong during the video generation process.</Text>
                  <Button type="primary" onClick={() => navigate('/dashboard')} style={{ marginTop: 16 }}>
                    Back to Dashboard
                  </Button>
                </Space>
              }
            />
          </div>
        )}
      </div>
    </Content>
  );
};

const Divider = ({ type, style }: { type?: 'horizontal' | 'vertical', style?: React.CSSProperties }) => (
  <div style={{ 
    display: 'inline-block', 
    width: type === 'vertical' ? 1 : '100%', 
    height: type === 'vertical' ? 24 : 1, 
    background: '#333', 
    margin: type === 'vertical' ? '0 12px' : '12px 0',
    ...style 
  }} />
);
