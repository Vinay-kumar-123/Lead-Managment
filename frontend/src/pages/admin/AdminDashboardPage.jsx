import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import api from '../../services/api.js';
import {
  Users,
  Building2,
  BookOpen,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Activity,
  PlusCircle,
  Eye,
  ShieldCheck,
  MapPin,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setIsLoading(true);
    api
      .get('/admin/dashboard')
      .then((res) => {
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError('Failed to load dashboard metrics');
        }
      })
      .catch((err) => {
        setError(err.message || 'Error fetching metrics');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <AdminLayout title="Overview Dashboard" subtitle="Real-time operational marketplace metrics">
        <div className="py-20 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#FF6A03] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-slate-500 font-medium">Querying live MongoDB records...</p>
        </div>
      </AdminLayout>
    );
  }

  const {
    stats,
    recentApplications = [],
    recentEnquiries = [],
    recentBlogs = [],
    recentActivityLogs = [],
  } = data || {};

  return (
    <AdminLayout title="Overview Dashboard" subtitle="Real-time operational marketplace metrics">
      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Quick Operational Actions Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          <span className="font-bold text-[#012A7A] block">Quick Operational Desk</span>
          <span className="text-[#64748B]">Immediate actions requiring administrator attention</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/applications?status=pending"
            className="py-2 px-3.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Pending Applications ({stats?.applications?.pending ?? 0})</span>
          </Link>
          <Link
            to="/admin/enquiries?status=new"
            className="py-2 px-3.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>New Enquiries ({stats?.enquiries?.new ?? 0})</span>
          </Link>
          <Link
            to="/admin/blogs/new"
            className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Article</span>
          </Link>
        </div>
      </div>

      {/* Primary KPI Grid (5 metrics from real DB) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {/* Customer Enquiries */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Customer Leads
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#012A7A] mb-1">
            {stats?.enquiries?.total ?? 0}
          </div>
          <Link
            to="/admin/enquiries"
            className="text-xs font-semibold text-[#FF6A03] hover:underline flex items-center gap-1"
          >
            <span>
              Manage Enquiries ({stats?.enquiries?.new ?? 0} new)
            </span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Partner Applications */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Partner Submissions
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#012A7A] mb-1">
            {stats?.applications?.total ?? 0}
          </div>
          <Link
            to="/admin/applications"
            className="text-xs font-semibold text-[#FF6A03] hover:underline flex items-center gap-1"
          >
            <span>
              Review Desk ({stats?.applications?.pending ?? 0} pending)
            </span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Published Providers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Verified Providers
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#012A7A] mb-1">
            {stats?.providers?.published ?? 0}
          </div>
          <Link
            to="/admin/providers"
            className="text-xs font-semibold text-[#FF6A03] hover:underline flex items-center gap-1"
          >
            <span>
              Profiles ({stats?.providers?.draft ?? 0} draft)
            </span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Editorial Content */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Editorial CMS
            </span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#012A7A] mb-1">
            {stats?.blogs?.published ?? 0}
          </div>
          <Link
            to="/admin/blogs"
            className="text-xs font-semibold text-[#FF6A03] hover:underline flex items-center gap-1"
          >
            <span>
              Articles ({stats?.blogs?.draft ?? 0} draft)
            </span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Two Column Section: Recent Applications & Recent Customer Enquiries */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        {/* Recent Partner Applications (6 cols) */}
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-[#012A7A] uppercase tracking-wider">
              Recent Partner Applications
            </h2>
            <Link
              to="/admin/applications"
              className="text-xs font-semibold text-[#FF6A03] hover:underline"
            >
              View All
            </Link>
          </div>

          {recentApplications.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              No partner applications submitted yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentApplications.map((app) => (
                <div key={app._id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate">
                      {app.businessName}
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate">
                      {app.contactPerson} · {app.city} ·{' '}
                      <span className="font-mono text-[10px] text-[#FF6A03]">
                        {app.referenceId}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        app.status === 'new'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : app.status === 'qualified'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {app.status === 'new' ? 'PENDING' : app.status.toUpperCase()}
                    </span>
                    <Link
                      to={`/admin/applications/${app._id}`}
                      className="text-xs font-semibold text-[#FF6A03] hover:underline"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Customer Enquiries (6 cols) */}
        <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-[#012A7A] uppercase tracking-wider">
              Recent Customer Leads
            </h2>
            <Link
              to="/admin/enquiries"
              className="text-xs font-semibold text-[#FF6A03] hover:underline"
            >
              View All
            </Link>
          </div>

          {recentEnquiries.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              No customer quote requests logged yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentEnquiries.map((enq) => (
                <div key={enq._id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate">{enq.name}</h3>
                    <p className="text-[11px] text-slate-500 truncate">
                      {enq.service || enq.category} · {enq.city} ·{' '}
                      <span className="font-mono text-[10px] text-[#FF6A03]">
                        {enq.referenceId}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                      {enq.status}
                    </span>
                    <Link
                      to="/admin/enquiries"
                      className="text-xs font-semibold text-[#FF6A03] hover:underline"
                    >
                      Desk
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity Logs Bar */}
      {recentActivityLogs.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <h2 className="text-xs font-bold text-[#012A7A] uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#FF6A03]" />
              <span>Recent Operational Audit Trail</span>
            </h2>
            <Link
              to="/admin/activity-logs"
              className="text-[11px] font-semibold text-[#FF6A03] hover:underline"
            >
              Full Log
            </Link>
          </div>
          <div className="space-y-2">
            {recentActivityLogs.slice(0, 4).map((log) => (
              <div
                key={log._id}
                className="flex items-center justify-between text-xs py-1.5 text-slate-600"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[10px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                    {log.action}
                  </span>
                  <span className="font-medium text-slate-800">{log.adminEmail}</span>
                </div>
                <span className="text-slate-400 text-[11px] font-mono">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
