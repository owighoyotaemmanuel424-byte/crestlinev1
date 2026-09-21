'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Clock, Mail, MapPin, MessageSquare, Phone, Send } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const CHANNELS = [
  {
    icon: Phone,
    title: 'Call us',
    detail: '+1 (555) 0100',
    note: 'Available 24/7 for lost cards, fraud and urgent account issues.',
  },
  {
    icon: Mail,
    title: 'Email us',
    detail: 'help@crestline.example',
    note: 'We reply within one business day, usually much sooner.',
  },
  {
    icon: MessageSquare,
    title: 'Live chat',
    detail: 'In your dashboard',
    note: 'Weekdays 08:00–20:00 for everyday account questions.',
  },
  {
    icon: MapPin,
    title: 'Visit a branch',
    detail: '18 Harbour Street, Suite 900',
    note: 'Weekdays 09:00–17:00, no appointment needed.',
  },
];

export default function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    topic: 'General enquiry',
    message: '',
  });
  const [error, setError] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError('Please add your name, email and a short message.');
      return;
    }

    const body = [
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      `Topic: ${form.topic}`,
      '',
      form.message,
    ].join('\n');

    window.location.href = `mailto:help@crestline.example?subject=${encodeURIComponent(
      `${form.topic} — ${form.name}`
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="bg-background">
      <section className="chase-navy relative overflow-hidden">
        <div className="chase-grid-lines absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-200">
            Contact
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            Talk to a human, whenever you need one
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/75">
            Lost your card, spotted an unfamiliar payment or just want help choosing an account?
            Our team is reachable around the clock.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Ways to reach us
            </h2>
            <div className="mt-8 space-y-5">
              {CHANNELS.map((channel) => (
                <div key={channel.title} className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                    <channel.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{channel.title}</p>
                    <p className="mt-0.5 text-sm font-medium text-primary">{channel.detail}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {channel.note}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="chase-card mt-8 flex items-start gap-4 p-5">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Holiday hours</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Phone lines stay open on public holidays. Branch lobbies may close early — check
                  your dashboard notices for updates.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <p className="text-sm text-muted-foreground">Already a customer?</p>
              <Button asChild variant="outline" className="mt-3">
                <Link href="/support">Open a support ticket</Link>
              </Button>
            </div>
          </div>

          <div className="chase-card p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Send us a message
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Completing this form opens your email client with the details filled in, so you can
              review before sending.
            </p>

            {error && (
              <Alert variant="destructive" className="mt-5">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  label="Your name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, name: event.target.value }))
                  }
                  placeholder="Jordan Adeyemi"
                />
                <Input
                  type="email"
                  label="Email address"
                  value={form.email}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, email: event.target.value }))
                  }
                  placeholder="you@example.com"
                />
              </div>

              <Select
                label="What is this about?"
                value={form.topic}
                onValueChange={(value) => setForm((previous) => ({ ...previous, topic: value }))}
              >
                <Select.Option value="General enquiry">General enquiry</Select.Option>
                <Select.Option value="New account">Opening a new account</Select.Option>
                <Select.Option value="Cards">Cards and payments</Select.Option>
                <Select.Option value="Loans">Loans and lending</Select.Option>
                <Select.Option value="Business banking">Business banking</Select.Option>
                <Select.Option value="Complaint">A complaint</Select.Option>
              </Select>

              <div>
                <label className="chase-label" htmlFor="contact-message">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  value={form.message}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, message: event.target.value }))
                  }
                  rows={6}
                  placeholder="Tell us what you need help with."
                  className="chase-input min-h-[8rem] resize-y py-3"
                />
              </div>

              <Button type="submit" size="lg" className="w-full">
                <Send className="h-4 w-4" />
                Compose email
              </Button>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Never include full card numbers, passwords or one-time codes in a message.
                Sandbox environment: messages are not delivered to a real bank.
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
