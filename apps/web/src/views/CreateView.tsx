import { Layout, Typography, Button, Row, Col, Card, Form, Input, Steps, Divider } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Content } = Layout;
const { Title, Text } = Typography;

interface CreateViewProps {
  isMobile: boolean;
  form: any;
  isSubmitting: boolean;
  onQueueJob: (values: any) => Promise<void>;
}

export const CreateView = ({ isMobile, form, isSubmitting, onQueueJob }: CreateViewProps) => {
  const navigate = useNavigate();

  return (
    <Content style={{ padding: isMobile ? '16px' : '32px', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <Button type="link" style={{ padding: 0, marginBottom: 16 }} onClick={() => navigate('/dashboard')}>
            &larr; Back to Dashboard
          </Button>
          <Title level={isMobile ? 3 : 2} style={{ margin: 0 }}>Generate AI Demo</Title>
          <Text type="secondary">Tell the AI agent what to record, and it will handle the rest.</Text>
        </div>

        <Row gutter={[32, 32]}>
          <Col xs={24} lg={16}>
            <Card bordered={false}>
              <Form form={form} layout="vertical" size="large" onFinish={onQueueJob}>
                <Form.Item name="url" label="Product URL" rules={[{ required: true, message: 'Please enter a URL' }]} tooltip="The starting point for the agent.">
                  <Input placeholder="https://your-app.com/login" />
                </Form.Item>
                <Form.Item name="instructions" label="What should the AI agent do?" rules={[{ required: true, message: 'Please provide instructions' }]} tooltip="Provide step-by-step instructions.">
                  <Input.TextArea 
                    rows={6} 
                    placeholder="e.g. Log in with test@example.com, navigate to the billing section, click 'Upgrade to Pro', and show the success banner." 
                  />
                </Form.Item>
                <Form.Item name="script" label="Voiceover Script (Optional)" tooltip="Leave blank to let the AI generate one automatically based on the actions.">
                  <Input.TextArea rows={3} placeholder="Start by welcoming the user..." />
                </Form.Item>
                <Divider />
                <Button type="primary" htmlType="submit" size="large" block loading={isSubmitting}>
                  Queue Generation
                </Button>
              </Form>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card bordered={false} style={{ background: 'transparent' }}>
              <Title level={5}>How it works</Title>
              <Steps
                direction="vertical"
                size="small"
                current={0}
                items={[
                  { title: 'Queue Job', description: 'Your request is sent to our worker queue.' },
                  { title: 'Agent Navigation', description: 'A headless browser opens and follows your instructions.' },
                  { title: 'Video Synthesis', description: 'Interactions are recorded and stitched together.' },
                  { title: 'Voiceover & Polish', description: 'AI voiceover is added and aligned with the video.' },
                  { title: 'Ready for Edit', description: 'Review and tweak the final video in our editor.' },
                ]}
              />
            </Card>
          </Col>
        </Row>
      </div>
    </Content>
  );
};
