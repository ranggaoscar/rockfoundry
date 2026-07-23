/**
 * Evaluation fixtures for AI extraction quality testing.
 * Each fixture includes a raw idea and the expected extraction outcome.
 */

import { InitialIdeaExtraction } from "../ai/schema";

export interface ExtractionFixture {
  name: string;
  rawIdea: string;
  expected: {
    productType?: string;
    primaryUsers: string[];
    coreEntities: string[];
    explicitFacts: number; // minimum
    assumptions: number;   // minimum
    ambiguities: number;   // minimum
    userProblems: number;  // minimum
  };
  description: string;
}

export const extractionFixtures: ExtractionFixture[] = [
  {
    name: "pet-sitter-booking",
    rawIdea: `A mobile-first booking platform that lets dog owners find and book trusted pet sitters in their neighborhood. Owners can browse sitter profiles with verified reviews, see real-time availability, and pay securely through the app. Sitters get a dashboard to manage bookings, set their rates, and receive payments automatically.`,
    expected: {
      productType: "Mobile App",
      primaryUsers: ["Dog Owners", "Pet Sitters"],
      coreEntities: ["User", "Booking", "Review", "Payment"],
      explicitFacts: 6,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 1,
    },
    description: "Two-sided marketplace for pet sitting with payments",
  },
  {
    name: "internal-hr-tool",
    rawIdea: `An internal web tool for HR to manage employee time-off requests. Employees submit requests, managers approve or deny, and payroll gets automatic reports. No public registration needed.`,
    expected: {
      productType: "Web Application",
      primaryUsers: ["HR", "Employees", "Managers", "Payroll"],
      coreEntities: ["Employee", "TimeOffRequest", "Approval", "Report"],
      explicitFacts: 5,
      assumptions: 1,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Internal B2B tool with clear user roles",
  },
  {
    name: "fitness-tracker",
    rawIdea: `I want to build an app that tracks daily workouts and nutrition. Users should be able to log exercises, see progress charts, and maybe connect with friends for challenges. Not sure about monetization yet.`,
    expected: {
      productType: "Mobile App",
      primaryUsers: ["Fitness Enthusiasts"],
      coreEntities: ["User", "Workout", "NutritionLog", "Challenge"],
      explicitFacts: 4,
      assumptions: 3,
      ambiguities: 2,
      userProblems: 0,
    },
    description: "Consumer fitness app with vague monetization",
  },
  {
    name: "saas-analytics-dashboard",
    rawIdea: `A SaaS dashboard that shows real-time analytics for e-commerce stores. It tracks sales, traffic sources, and customer behavior. Integrates with Shopify and WooCommerce. Targets small to medium business owners who want simple reports without the complexity of enterprise tools.`,
    expected: {
      productType: "SaaS",
      primaryUsers: ["E-commerce Store Owners", "Small Business Owners"],
      coreEntities: ["Store", "Sale", "TrafficSource", "Customer", "Report"],
      explicitFacts: 6,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 1,
    },
    description: "B2B SaaS with clear integrations and target users",
  },
  {
    name: "note-taking-app",
    rawIdea: `Just a simple note-taking app where I can write and organize notes. Maybe with tags and search. No need for real-time collaboration.`,
    expected: {
      productType: "Mobile App",
      primaryUsers: ["Individual Users"],
      coreEntities: ["Note", "Tag"],
      explicitFacts: 3,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Simple consumer app with minimal requirements",
  },
  {
    name: "crypto-wallet",
    rawIdea: `Build a self-custodial crypto wallet that supports Bitcoin and Ethereum. Users can send, receive, and swap tokens. Must be secure with hardware wallet support and biometric authentication. Eventually we want to add NFT viewing.`,
    expected: {
      productType: "Mobile App",
      primaryUsers: ["Crypto Users"],
      coreEntities: ["Wallet", "Transaction", "Token", "NFT"],
      explicitFacts: 6,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Crypto wallet with security requirements",
  },
  {
    name: "restaurant-reservation",
    rawIdea: `A platform for restaurants to manage reservations and waitlists. Customers can book tables online, see menu previews, and get notified when their table is ready. Restaurants get a tablet app for floor management.`,
    expected: {
      productType: "Platform",
      primaryUsers: ["Restaurants", "Customers"],
      coreEntities: ["Restaurant", "Reservation", "Menu", "Table", "Waitlist"],
      explicitFacts: 5,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Two-sided platform for restaurant reservations",
  },
  {
    name: "doctor-telemedicine",
    rawIdea: `A telemedicine app connecting patients with doctors via video calls. Patients can book appointments, have virtual consultations, get prescriptions sent to their pharmacy, and rate their experience. Doctors manage their availability and see patient history.`,
    expected: {
      productType: "Mobile App",
      primaryUsers: ["Patients", "Doctors"],
      coreEntities: ["Patient", "Doctor", "Appointment", "Prescription", "Review"],
      explicitFacts: 6,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Healthcare app with clear workflows",
  },
  {
    name: "freelancer-invoicing",
    rawIdea: `A web tool for freelancers to create and send invoices, track payments, and manage expenses. It integrates with Stripe for payments and generates tax reports. No team features needed, just individual freelancers.`,
    expected: {
      productType: "Web Application",
      primaryUsers: ["Freelancers"],
      coreEntities: ["Invoice", "Payment", "Expense", "TaxReport"],
      explicitFacts: 5,
      assumptions: 1,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Single-user B2B SaaS for freelancers",
  },
  {
    name: "social-media-scheduler",
    rawIdea: `A tool for social media managers to schedule posts across Instagram, Twitter, and LinkedIn. It supports draft workflows, team collaboration with role-based access, and basic analytics. Should also suggest optimal posting times based on audience data.`,
    expected: {
      productType: "SaaS",
      primaryUsers: ["Social Media Managers", "Marketing Teams"],
      coreEntities: ["Post", "Schedule", "TeamMember", "Analytics", "Platform"],
      explicitFacts: 5,
      assumptions: 3,
      ambiguities: 2,
      userProblems: 0,
    },
    description: "B2B SaaS with team features",
  },
  {
    name: "vague-general-idea",
    rawIdea: `I want to make an app that helps people. It should be modern and use AI. I think it could make money somehow.`,
    expected: {
      productType: "Mobile App",
      primaryUsers: ["People"],
      coreEntities: [],
      explicitFacts: 1,
      assumptions: 1,
      ambiguities: 3,
      userProblems: 0,
    },
    description: "Extremely vague idea - should produce mostly ambiguities",
  },
  {
    name: "enterprise-procurement",
    rawIdea: `A procurement platform for enterprise companies with multi-tenant support, approval workflows with chain of command, vendor management modules, purchase order generation, contract lifecycle management, budget tracking, compliance auditing, and integrations with SAP and Oracle. Must support SSO/SAML, role-based access control with custom roles, audit logging, and SOC2 compliance.`,
    expected: {
      productType: "Platform",
      primaryUsers: ["Enterprise Companies", "Procurement Teams", "Finance Teams"],
      coreEntities: ["Vendor", "PurchaseOrder", "Contract", "Budget", "AuditLog"],
      explicitFacts: 8,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Complex enterprise platform with detailed requirements",
  },
  {
    name: "kids-educational-game",
    rawIdea: `A mobile educational game for kids aged 5-8 to learn math through interactive puzzles. No ads, no data collection, parent can set time limits. Available on iPad. Free with optional paid content packs.`,
    expected: {
      productType: "Mobile App",
      primaryUsers: ["Kids aged 5-8", "Parents"],
      coreEntities: ["Child", "Puzzle", "Progress", "ContentPack"],
      explicitFacts: 6,
      assumptions: 1,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Kids app with privacy requirements",
  },
  {
    name: "real-estate-mls",
    rawIdea: `A real estate platform where agents can list properties with photos, virtual tours, and pricing. Buyers can search by location, price range, property type, and save favorites. Includes mortgage calculator and agent contact forms.`,
    expected: {
      productType: "Platform",
      primaryUsers: ["Real Estate Agents", "Property Buyers"],
      coreEntities: ["Property", "Agent", "Buyer", "Listing", "Tour"],
      explicitFacts: 5,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Real estate marketplace",
  },
  {
    name: "music-streaming",
    rawIdea: `A music streaming service focused on independent artists. Artists can upload their music, set their own pricing, and keep 90% of revenue. Listeners can discover new music through curated playlists and genre browsing. Available on web and mobile.`,
    expected: {
      productType: "Platform",
      primaryUsers: ["Independent Artists", "Music Listeners"],
      coreEntities: ["Artist", "Track", "Album", "Playlist", "Revenue"],
      explicitFacts: 6,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Music marketplace with clear revenue model",
  },
  {
    name: "event-ticketing",
    rawIdea: `An event ticketing platform where organizers can create events, sell tickets, and check attendees in at the door. Supports multiple ticket tiers, promotional codes, and refunds. Integrates with Google Calendar for event reminders.`,
    expected: {
      productType: "Platform",
      primaryUsers: ["Event Organizers", "Attendees"],
      coreEntities: ["Event", "Ticket", "Attendee", "Promotion", "CheckIn"],
      explicitFacts: 5,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Event platform with ticketing workflow",
  },
  {
    name: "meal-prep-service",
    rawIdea: `A weekly meal prep subscription service. Users choose their meals from a rotating menu, receive ingredients with recipe cards, and track their nutrition. Integrates with fitness trackers like Apple Health and Fitbit for calorie goals.`,
    expected: {
      productType: "Platform",
      primaryUsers: ["Home Cooks", "Health-conscious Individuals"],
      coreEntities: ["User", "Meal", "Subscription", "Recipe", "NutritionLog"],
      explicitFacts: 4,
      assumptions: 3,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Subscription service with health integrations",
  },
  {
    name: "customer-support-tool",
    rawIdea: `A customer support ticket system for small businesses. Supports email-to-ticket conversion, shared inbox, canned responses, and basic reporting. No live chat, no phone system needed. Just email-based ticketing.`,
    expected: {
      productType: "SaaS",
      primaryUsers: ["Small Business Owners", "Support Teams"],
      coreEntities: ["Ticket", "Customer", "Agent", "CannedResponse", "Report"],
      explicitFacts: 5,
      assumptions: 1,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Simple B2B SaaS with clear scope boundaries",
  },
  {
    name: "content-management-system",
    rawIdea: `A headless CMS for developers. It has a web UI for content editors, a GraphQL API for developers to query content, webhook triggers for content changes, role-based access, media library, and supports versioning with rollback.`,
    expected: {
      productType: "SaaS",
      primaryUsers: ["Content Editors", "Developers"],
      coreEntities: ["Content", "User", "Media", "Webhook", "Version"],
      explicitFacts: 6,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Developer tool with clear technical specifications",
  },
  {
    name: "grocery-delivery",
    rawIdea: `A grocery delivery app where users can order groceries from local stores and get them delivered within 2 hours. Supports real-time tracking of delivery drivers, substitution preferences for out-of-stock items, and digital tipping.`,
    expected: {
      productType: "Mobile App",
      primaryUsers: ["Online Shoppers", "Delivery Drivers"],
      coreEntities: ["Order", "Product", "Driver", "Store", "Delivery"],
      explicitFacts: 5,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "On-demand delivery app with real-time tracking",
  },
  {
    name: "project-management-tool",
    rawIdea: `A simple project management tool for small teams. Supports kanban boards, task assignments, due dates, file attachments, and activity feed. Free for up to 5 users, paid plans for larger teams. No Gantt charts or resource management needed.`,
    expected: {
      productType: "SaaS",
      primaryUsers: ["Small Teams"],
      coreEntities: ["Project", "Task", "User", "Attachment"],
      explicitFacts: 6,
      assumptions: 2,
      ambiguities: 1,
      userProblems: 0,
    },
    description: "Freemium SaaS with clear feature boundaries",
  },
];
